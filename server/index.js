import express from 'express';
import cors from 'cors';
import ldap from 'ldapjs';
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
  ldap.createClient({
    url: `ldaps://${dcServer}:636`,
    tlsOptions: { rejectUnauthorized: false },
    timeout: 15000,
    connectTimeout: 15000,
  });

const bind = (client, dn, password) =>
  new Promise((resolve, reject) =>
    client.bind(dn, password, err => (err ? reject(err) : resolve())));

const unbind = (client) =>
  new Promise(resolve => client.unbind(() => resolve()));

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
    await bind(client, username, password);
    await unbind(client);
    res.json({ success: true, message: 'Connected to domain successfully' });
  } catch (err) {
    client.destroy();
    res.status(401).json({ error: err.message || 'Connection failed' });
  }
});

app.post('/api/groups', async (req, res) => {
  const { dcServer, username, password } = req.body;
  if (!dcServer || !username || !password)
    return res.status(400).json({ error: 'Missing credentials' });

  const client = createClient(dcServer);
  try {
    await bind(client, username, password);

    const groups = await new Promise((resolve, reject) => {
      const found = [];
      client.search(BASE_DN, {
        filter: '(objectClass=group)',
        scope: 'sub',
        attributes: ['cn'],
      }, (err, result) => {
        if (err) return reject(err);
        result.on('searchEntry', entry => {
          const cn = entry.object.cn;
          if (cn) found.push(Array.isArray(cn) ? cn[0] : cn);
        });
        result.on('error', reject);
        result.on('end', () => resolve(found.sort()));
      });
    });

    await unbind(client);
    res.json({ success: true, groups });
  } catch (err) {
    client.destroy();
    res.status(500).json({ error: err.message || 'Failed to fetch groups' });
  }
});

app.post('/api/provision', async (req, res) => {
  const { dcServer, username: adminUser, password: adminPass, users, targetOu } = req.body;

  if (!users || !Array.isArray(users) || users.length === 0)
    return res.status(400).json({ error: 'Missing user details' });

  const client = createClient(dcServer);

  try {
    await bind(client, adminUser, adminPass);

    const userExists = (sam) =>
      new Promise((resolve, reject) => {
        client.search(BASE_DN, {
          filter: `(sAMAccountName=${sam})`,
          scope: 'sub',
          attributes: ['sAMAccountName'],
        }, (err, result) => {
          if (err) return reject(err);
          let found = false;
          result.on('searchEntry', () => { found = true; });
          result.on('error', reject);
          result.on('end', () => resolve(found));
        });
      });

    const findGroupDN = (groupName) =>
      new Promise((resolve, reject) => {
        client.search(BASE_DN, {
          filter: `(&(objectClass=group)(cn=${groupName}))`,
          scope: 'sub',
          attributes: ['dn'],
        }, (err, result) => {
          if (err) return reject(err);
          let dn = null;
          result.on('searchEntry', entry => { dn = entry.objectName; });
          result.on('error', reject);
          result.on('end', () => resolve(dn));
        });
      });

    const createdUsers = [];

    for (const u of users) {
      // Resolve username conflicts by appending a counter
      let finalUsername = u.username;
      let counter = 1;
      while (await userExists(finalUsername)) {
        finalUsername = `${u.username}${counter++}`;
      }

      const userDN = `CN=${u.firstName} ${u.lastName},${targetOu}`;

      // Step 1: Create user in disabled state (can't set password on enabled account without prior password)
      await new Promise((resolve, reject) => {
        client.add(userDN, {
          objectClass: ['top', 'person', 'organizationalPerson', 'user'],
          cn: `${u.firstName} ${u.lastName}`,
          sAMAccountName: finalUsername,
          userPrincipalName: `${finalUsername}@${UPN_SUFFIX}`,
          givenName: u.firstName,
          sn: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          userAccountControl: '514', // disabled
        }, err => (err ? reject(err) : resolve()));
      });

      // Step 2: Set password via LDAPS (required — plain LDAP blocks this)
      await new Promise((resolve, reject) => {
        client.modify(userDN, [
          new ldap.Change({
            operation: 'replace',
            modification: new ldap.Attribute({
              type: 'unicodePwd',
              values: [encodePassword(u.password)],
            }),
          }),
        ], err => (err ? reject(err) : resolve()));
      });

      // Step 3: Enable account + password never expires (userAccountControl 0x10200 = 66048)
      await new Promise((resolve, reject) => {
        client.modify(userDN, [
          new ldap.Change({
            operation: 'replace',
            modification: new ldap.Attribute({
              type: 'userAccountControl',
              values: ['66048'],
            }),
          }),
        ], err => (err ? reject(err) : resolve()));
      });

      // Step 4: Add to groups
      for (const groupName of (u.groups || [])) {
        const groupDN = await findGroupDN(groupName);
        if (groupDN) {
          await new Promise((resolve, reject) => {
            client.modify(groupDN, [
              new ldap.Change({
                operation: 'add',
                modification: new ldap.Attribute({
                  type: 'member',
                  values: [userDN],
                }),
              }),
            ], err => (err ? reject(err) : resolve()));
          });
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

    await unbind(client);
    res.json({ success: true, message: 'Users provisioned successfully', createdUsers });
  } catch (err) {
    client.destroy();
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
