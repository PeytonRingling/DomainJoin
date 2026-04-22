import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;
const UPN_SUFFIX = process.env.UPN_SUFFIX || 'corp.example.com';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const escapePS = (str) => {
  if (!str) return '';
  return str.replace(/'/g, "''");
};

const runPowerShellScript = async (lines) => {
    const scriptString = lines.join('\n');
    const tmpFilePath = path.join(os.tmpdir(), `ps-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.ps1`);
    fs.writeFileSync(tmpFilePath, scriptString, 'utf8');
    try {
        return await execPromise(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpFilePath}"`, {maxBuffer: 1024 * 1024 * 50});
    } finally {
        try { fs.unlinkSync(tmpFilePath); } catch (e) {}
    }
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/connect', async (req, res) => {
  const { dcServer, username, password } = req.body;
  if (!dcServer || !username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const scriptLines = [
    `$ErrorActionPreference = 'Stop'`,
    `try { Import-Module ActiveDirectory -ErrorAction Stop } catch {}`,
    `try {`,
    `  $secPass = New-Object System.Security.SecureString`,
    `  '${escapePS(password)}'.ToCharArray() | ForEach-Object { $secPass.AppendChar($_) }`,
    `  $cred = New-Object System.Management.Automation.PSCredential ('${escapePS(username)}', $secPass)`,
    `  $domain = Get-ADDomain -Server '${escapePS(dcServer)}' -Credential $cred`,
    `  Write-Output 'SUCCESS'`,
    `} catch {`,
    `  Write-Error $_.Exception.Message`,
    `}`
  ];

  try {
    const { stdout, stderr } = await runPowerShellScript(scriptLines);
    if (stdout.includes('SUCCESS')) {
      return res.json({ success: true, message: 'Connected to domain successfully' });
    } else {
      return res.status(401).json({ error: stderr || stdout || 'Connection failed' });
    }
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Connection failed' });
  }
});

app.post('/api/groups', async (req, res) => {
  const { dcServer, username, password } = req.body;
  if (!dcServer || !username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const scriptLines = [
    `$ErrorActionPreference = 'Stop'`,
    `try { Import-Module ActiveDirectory -ErrorAction Stop } catch {}`,
    `try {`,
    `  $secPass = New-Object System.Security.SecureString`,
    `  '${escapePS(password)}'.ToCharArray() | ForEach-Object { $secPass.AppendChar($_) }`,
    `  $cred = New-Object System.Management.Automation.PSCredential ('${escapePS(username)}', $secPass)`,
    `  $groups = Get-ADGroup -Filter * -Server '${escapePS(dcServer)}' -Credential $cred | Sort-Object Name | Select-Object -ExpandProperty Name`,
    `  @($groups) | ConvertTo-Json -Compress`,
    `} catch {`,
    `  Write-Error $_.Exception.Message`,
    `}`
  ];

  try {
    const { stdout, stderr } = await runPowerShellScript(scriptLines);
    const match = stdout.match(/\[.*\]/s);
    if (match) {
       return res.json({ success: true, groups: JSON.parse(match[0]) });
    } else {
       if (stdout.includes('WriteErrorException')) throw new Error(stdout);
       return res.json({ success: true, groups: [] });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch groups' });
  }
});

app.post('/api/provision', async (req, res) => {
  const { dcServer, username: adminUser, password: adminPass, users, targetOu } = req.body;
  
  if (!users || !Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Missing user details' });
  }

  const scriptLines = [
    `$ErrorActionPreference = 'Stop'`,
    `try { Import-Module ActiveDirectory -ErrorAction Stop } catch {}`,
    `try {`,
    `  $secSysPass = New-Object System.Security.SecureString`,
    `  '${escapePS(adminPass)}'.ToCharArray() | ForEach-Object { $secSysPass.AppendChar($_) }`,
    `  $sysCred = New-Object System.Management.Automation.PSCredential ('${escapePS(adminUser)}', $secSysPass)`,
    `  $createdUsersOut = @()`
  ];

  users.forEach((u, index) => {
    const un = "u" + index; 
    scriptLines.push(
      `  $baseUn_${un} = '${escapePS(u.username)}'`,
      `  $finalUn_${un} = $baseUn_${un}`,
      `  $counter_${un} = 1`,
      `  while ($null -ne (Get-ADUser -Filter "SamAccountName -eq '$finalUn_${un}'" -Server '${escapePS(dcServer)}' -Credential $sysCred -ErrorAction SilentlyContinue)) {`,
      `      $finalUn_${un} = "$baseUn_${un}$counter_${un}"`,
      `      $counter_${un}++`,
      `  }`,
      `  $secUserPass_${un} = New-Object System.Security.SecureString`,
      `  '${escapePS(u.password)}'.ToCharArray() | ForEach-Object { $secUserPass_${un}.AppendChar($_) }`,
      `  $userParams_${un} = @{`,
      `      Server = '${escapePS(dcServer)}'`,
      `      Credential = $sysCred`,
      `      Name = '${escapePS(u.firstName)} ${escapePS(u.lastName)}'`,
      `      GivenName = '${escapePS(u.firstName)}'`,
      `      Surname = '${escapePS(u.lastName)}'`,
      `      SamAccountName = $finalUn_${un}`,
      `      UserPrincipalName = "$finalUn_${un}@${UPN_SUFFIX}"`,
      `      AccountPassword = $secUserPass_${un}`,
      `      Enabled = $true`,
      `      PasswordNeverExpires = $true`,
      `      PassThru = $true`,
      `  }`
    );

    if (targetOu && targetOu.trim() !== '') {
        scriptLines.push(`  $userParams_${un}.Add('Path', '${escapePS(targetOu)}')`);
    }

    scriptLines.push(`  $createdUser_${un} = New-ADUser @userParams_${un}`);
    
    if (u.groups && u.groups.length > 0) {
      u.groups.forEach(g => {
        scriptLines.push(`  Add-ADGroupMember -Identity '${escapePS(g)}' -Members $createdUser_${un}.ObjectGUID -Server '${escapePS(dcServer)}' -Credential $sysCred`);
      });
    }

    scriptLines.push(
      `  $createdUsersOut += @{`,
      `       originalId = '${u.originalId}'`,
      `       firstName = '${escapePS(u.firstName)}'`,
      `       lastName = '${escapePS(u.lastName)}'`,
      `       username = $finalUn_${un}`,
      `       password = '${escapePS(u.password)}'`,
      `       groups = ${u.groups ? u.groups.length : 0}`,
      `  }`
    );
  });

  scriptLines.push(
    `  @($createdUsersOut) | ConvertTo-Json -Compress`,
    `} catch {`,
    `  Write-Error $_.Exception.Message`,
    `}`
  );

  try {
    const { stdout, stderr } = await runPowerShellScript(scriptLines);
    const match = stdout.match(/\[.*\]|\{.*\}/s);
    if (match) {
        let parsedPayload = JSON.parse(match[0]);
        if (!Array.isArray(parsedPayload)) parsedPayload = [parsedPayload];
        return res.json({ success: true, message: 'Users provisioned successfully', createdUsers: parsedPayload });
    } else {
        throw new Error(stderr || stdout || 'Provisioning returned no confirmation — check AD connectivity and credentials');
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Provisioning failed' });
  }
});

const server = app.listen(PORT, () => {
  console.log("Backend server running on port " + PORT);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use, skipping parallel Express boot.`);
  } else {
    console.error(e);
  }
});
