import express from 'express';
import { Client, Attribute, Change } from 'ldapts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const UPN_SUFFIX = process.env.UPN_SUFFIX || 'corp.example.com';

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Derive base DN from UPN suffix: "corp.example.com" -> "DC=corp,DC=example,DC=com"
const BASE_DN = UPN_SUFFIX.split('.').map(p => `DC=${p}`).join(',');

const createClient = (dcServer) =>
  new Client({
    url: `ldaps://${dcServer}:636`,
    tlsOptions: { rejectUnauthorized: false },
    timeout: 15000,
    connectTimeout: 15000,
  });

// Auto-append UPN suffix if no domain is specified (no @ or \)
const normalizeUsername = (username) =>
  username.includes('@') || username.includes('\\') ? username : `${username}@${UPN_SUFFIX}`;

// Escape special characters in LDAP filter values (RFC 4515)
const escapeLdapFilter = (val) =>
  String(val).replace(/[\x00()*\\]/g, c => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

// AD requires passwords to be UTF-16LE encoded and wrapped in quotes
const encodePassword = (password) =>
  Buffer.from(`"${password}"`, 'utf16le');

// ── Brute-force protection ────────────────────────────────────────────────────
const loginAttempts = new Map(); // ip -> { failures, lockedUntil }
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

const isRateLimited = (ip) => {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil)
    return Math.ceil((rec.lockedUntil - Date.now()) / 60000);
  return false;
};

const onLoginSuccess = (ip) => loginAttempts.delete(ip);

const onLoginFailure = (ip) => {
  const rec = loginAttempts.get(ip) || { failures: 0 };
  rec.failures += 1;
  if (rec.failures >= MAX_FAILURES) rec.lockedUntil = Date.now() + LOCKOUT_MS;
  loginAttempts.set(ip, rec);
};
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) =>
  res.json({ status: 'healthy', timestamp: new Date().toISOString() }));

app.post('/api/connect', async (req, res) => {
  const { dcServer, username, password } = req.body;
  if (!dcServer || !username || !password)
    return res.status(400).json({ error: 'Missing credentials' });

  const ip = getClientIp(req);
  const minutesLeft = isRateLimited(ip);
  if (minutesLeft)
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` });

  const client = createClient(dcServer);
  try {
    await client.bind(normalizeUsername(username), password);
    onLoginSuccess(ip);
    res.json({ success: true, message: 'Connected to domain successfully' });
  } catch (err) {
    onLoginFailure(ip);
    res.status(401).json({ error: err.message || 'Connection failed' });
  } finally {
    await client.unbind().catch(() => {});
  }
});

app.post('/api/groups', async (req, res) => {
  const { dcServer, username, password } = req.body;
  if (!dcServer || !username || !password)
    return res.status(400).json({ error: 'Missing credentials' });

  const client = createClient(dcServer);
  try {
    await client.bind(normalizeUsername(username), password);

    const { searchEntries } = await client.search(BASE_DN, {
      filter: '(objectClass=group)',
      scope: 'sub',
      attributes: ['cn'],
    });

    const groups = searchEntries
      .map(e => e.cn)
      .filter(Boolean)
      .map(cn => (Array.isArray(cn) ? cn[0] : cn))
      .sort();

    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch groups' });
  } finally {
    await client.unbind().catch(() => {});
  }
});

app.post('/api/provision', async (req, res) => {
  const { dcServer, username: adminUser, password: adminPass, users, targetOu } = req.body;

  if (!dcServer || !adminUser || !adminPass)
    return res.status(400).json({ error: 'Missing credentials' });
  if (!targetOu)
    return res.status(400).json({ error: 'Missing target OU' });
  if (!users || !Array.isArray(users) || users.length === 0)
    return res.status(400).json({ error: 'Missing user details' });

  const client = createClient(dcServer);

  try {
    await client.bind(normalizeUsername(adminUser), adminPass);

    const userExists = async (sam) => {
      const { searchEntries } = await client.search(BASE_DN, {
        filter: `(sAMAccountName=${escapeLdapFilter(sam)})`,
        scope: 'sub',
        attributes: ['sAMAccountName'],
      });
      return searchEntries.length > 0;
    };

    const findGroupDN = async (groupName) => {
      const { searchEntries } = await client.search(BASE_DN, {
        filter: `(&(objectClass=group)(cn=${escapeLdapFilter(groupName)}))`,
        scope: 'sub',
        attributes: ['dn'],
      });
      return searchEntries.length > 0 ? searchEntries[0].dn : null;
    };

    const createdUsers = [];
    const failedUsers = [];

    for (const u of users) {
      try {
        // Resolve sAMAccountName conflicts: jsmith -> jsmith1 -> jsmith2 ...
        let finalUsername = u.username;
        let counter = 1;
        while (await userExists(finalUsername)) {
          finalUsername = `${u.username}${counter++}`;
        }

        // Append the conflict counter to the CN so the DN is unique within the OU
        const cnSuffix = finalUsername !== u.username ? ` ${finalUsername.slice(u.username.length)}` : '';
        const displayCN = `${u.firstName} ${u.lastName}${cnSuffix}`;
        const userDN = `CN=${displayCN},${targetOu}`;

        // Step 1: Create user in disabled state
        await client.add(userDN, {
          objectClass: ['top', 'person', 'organizationalPerson', 'user'],
          cn: displayCN,
          sAMAccountName: finalUsername,
          userPrincipalName: `${finalUsername}@${UPN_SUFFIX}`,
          givenName: u.firstName,
          sn: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          userAccountControl: '514', // disabled
        });

        // Step 2: Set password via LDAPS (required — plain LDAP blocks this)
        await client.modify(userDN, [
          new Change({
            operation: 'replace',
            modification: new Attribute({ type: 'unicodePwd', values: [encodePassword(u.password)] }),
          }),
        ]);

        // Step 3: Enable account + password never expires (0x10200 = 66048)
        await client.modify(userDN, [
          new Change({
            operation: 'replace',
            modification: new Attribute({ type: 'userAccountControl', values: ['66048'] }),
          }),
        ]);

        // Step 4: Add to groups
        for (const groupName of (u.groups || [])) {
          const groupDN = await findGroupDN(groupName);
          if (groupDN) {
            await client.modify(groupDN, [
              new Change({
                operation: 'add',
                modification: new Attribute({ type: 'member', values: [userDN] }),
              }),
            ]);
          }
        }

        createdUsers.push({
          originalId: u.originalId,
          firstName: u.firstName,
          lastName: u.lastName,
          username: finalUsername,
          password: u.password,
          groups: u.groups ? u.groups.length : 0,
        });
      } catch (err) {
        failedUsers.push({
          originalId: u.originalId,
          firstName: u.firstName,
          lastName: u.lastName,
          error: err.message || 'Unknown error',
        });
      }
    }

    res.json({
      success: true,
      message: failedUsers.length
        ? `${createdUsers.length} provisioned, ${failedUsers.length} failed`
        : `${createdUsers.length} user(s) provisioned successfully`,
      createdUsers,
      failedUsers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Provisioning failed' });
  } finally {
    await client.unbind().catch(() => {});
  }
});

const server = app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use, skipping parallel Express boot.`);
  } else {
    console.error(e);
  }
});
