import express from 'express';
import cors from 'cors';
import { Client, Attribute, Change } from 'ldapts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const UPN_SUFFIX = process.env.UPN_SUFFIX || 'corp.example.com';

app.use(cors());
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

// AD requires passwords to be UTF-16LE encoded and wrapped in quotes
const encodePassword = (password) =>
  Buffer.from(`"${password}"`, 'utf16le');

app.get('/api/health', (_req, res) =>
  res.json({ status: 'healthy', timestamp: new Date().toISOString() }));

app.post('/api/connect', async (req, res) => {
  const { dcServer, username, password } = req.body;
  if (!dcServer || !username || !password)
    return res.status(400).json({ error: 'Missing credentials' });

  const client = createClient(dcServer);
  try {
    await client.bind(username, password);
    await client.unbind();
    res.json({ success: true, message: 'Connected to domain successfully' });
  } catch (err) {
    res.status(401).json({ error: err.message || 'Connection failed' });
  }
});

app.post('/api/groups', async (req, res) => {
  const { dcServer, username, password } = req.body;
  if (!dcServer || !username || !password)
    return res.status(400).json({ error: 'Missing credentials' });

  const client = createClient(dcServer);
  try {
    await client.bind(username, password);

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

    await client.unbind();
    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch groups' });
  }
});

app.post('/api/provision', async (req, res) => {
  const { dcServer, username: adminUser, password: adminPass, users, targetOu } = req.body;

  if (!users || !Array.isArray(users) || users.length === 0)
    return res.status(400).json({ error: 'Missing user details' });

  const client = createClient(dcServer);

  try {
    await client.bind(adminUser, adminPass);

    const userExists = async (sam) => {
      const { searchEntries } = await client.search(BASE_DN, {
        filter: `(sAMAccountName=${sam})`,
        scope: 'sub',
        attributes: ['sAMAccountName'],
      });
      return searchEntries.length > 0;
    };

    const findGroupDN = async (groupName) => {
      const { searchEntries } = await client.search(BASE_DN, {
        filter: `(&(objectClass=group)(cn=${groupName}))`,
        scope: 'sub',
        attributes: ['dn'],
      });
      return searchEntries.length > 0 ? searchEntries[0].dn : null;
    };

    const createdUsers = [];

    for (const u of users) {
      // Resolve username conflicts by appending a counter
      let finalUsername = u.username;
      let counter = 1;
      while (await userExists(finalUsername)) {
        finalUsername = `${u.username}${counter++}`;
      }

      const userDN = `CN=${u.firstName} ${u.lastName},${targetOu}`;

      // Step 1: Create user in disabled state
      await client.add(userDN, {
        objectClass: ['top', 'person', 'organizationalPerson', 'user'],
        cn: `${u.firstName} ${u.lastName}`,
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
    }

    await client.unbind();
    res.json({ success: true, message: 'Users provisioned successfully', createdUsers });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Provisioning failed' });
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
