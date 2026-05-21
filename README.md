# DomainJoin — Active Directory User Provisioner

A web-based tool for bulk-provisioning Active Directory users. Authenticate with a domain admin account, build a user queue, assign AD group memberships, and provision multiple accounts in one shot. Created credentials are displayed in a transaction log at the end of the session.

Runs as a **Windows container** (required for the AD PowerShell module) served on port `3001`.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Desktop | Electron |
| Runtime | Windows Container (Docker) |
| AD Integration | PowerShell (`New-ADUser`, `Add-ADGroupMember`) |

---

## Docker Deployment

> Docker Desktop must be in **Windows containers** mode.

### 1. Clone and configure

```bash
git clone https://github.com/PeytonRingling/DomainJoin.git
cd DomainJoin
```

Copy the example env file and adjust values for your environment:

```bash
cp .env.example .env
```

| Variable | When used | Description |
|---|---|---|
| `VITE_DEFAULT_DC` | Build-time | Default DC IP pre-filled in the login form |
| `VITE_DEFAULT_OU` | Build-time | Default OU path pre-filled in the provisioning form |
| `UPN_SUFFIX` | Runtime | UPN suffix appended to new usernames (e.g. `jsmith@domain.com`) |
| `PORT` | Runtime | Port Express listens on inside the container (default `3001`) |

> **Note:** `VITE_DEFAULT_DC` and `VITE_DEFAULT_OU` are baked into the frontend bundle at build time. Changing them after the image is built has no effect — rebuild the image to apply changes.

### 2. Build and start

```bash
docker compose build
docker compose up -d
```

The app will be available at `http://<server-ip>:3001`.

---

## Usage

1. **Connect** — Enter your DC server IP and domain admin credentials (`DOMAIN\admin`). The app verifies connectivity via `Get-ADDomain`.
2. **Queue users** — Enter first and last names for each user. Click **Assign Groups** per row to select AD group memberships from a live-fetched list.
3. **Provision** — Click the provision button. The backend creates each user via `New-ADUser`, handles username conflicts automatically (appends a counter), and adds group memberships.
4. **Transaction log** — Provisioned users appear below the form with their generated username and temporary password.

Usernames are generated as `firstinitial+lastname` (e.g. `jsmith`). Passwords are auto-generated and shown only in the transaction log at the end of the session.

---

## Local Development

Requires Node.js 20+ and Windows with RSAT Active Directory PowerShell tools installed.

```bash
npm install
npm run dev       # Vite frontend on :5173
node server/index.js  # Express backend on :3001
```

To build the Electron desktop app:

```bash
npm run dist
```
