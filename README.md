<p align="center">
  <img src="assets/readme-logo.svg" alt="VPROJECT" width="640" />
</p>

<p align="center">
  Node.js Discord bot for VPROJECT with recruitment category automation and an admin-approved role request workflow.
</p>

## Features

- Recruitment architecture management (channels/roles/pins) driven by `recruitment-architecture.json`
- Discord-only role requests with admin approval (leaders/deputies request → admins approve/reject)
- Basic moderation/automation helpers (auto-roles, message tracking)
- Utilities and scripts for provisioning and health checks

## Quick start

### 1) Install

```bash
npm ci
```

### 2) Configure environment

- Create a `.env` file (never commit it):

```bash
cp .env.example .env
```

Fill at least:
- `DISCORD_TOKEN`
- `GUILD_ID` (needed for one-off setup scripts)

### 3) Run

```bash
node src/index.js
```

## Role requests (Discord channels)

This workflow is designed so leaders/deputies can request role assignment for users, but an admin must approve.

Default channel names (configurable in `recruitment-architecture.json`):
- `📝│запросы-ролей` — request creation
- `🔐│одобрение-ролей` — admin decisions

Commands:
- In `📝│запросы-ролей`:
  - `!роль <лидер|зам|база> @user <reason>`
- In `🔐│одобрение-ролей`:
  - `!одобрить <ID>`
  - `!отклонить <ID> <reason>`

## One-off setup: create role request category + channels

```bash
node scripts/setup-role-requests-discord.js
```

Requires `.env` with:
- `DISCORD_TOKEN`
- `GUILD_ID`

The script creates the category `🛂│запросы-ролей`, the two text channels, sets permission overwrites, and stores IDs into `data/recruitment-architecture-state.json` (this file is intentionally ignored by git).

## Security / what not to commit

This repo is configured to avoid committing secrets and runtime state.

- Never commit `.env` (contains tokens/passwords)
- Keep secrets in environment variables, not in tracked files
- Files intentionally ignored by git:
  - `.env`
  - `node_modules/`, `logs/`, `backups/`
  - runtime state under `data/` such as `messages.json`, `recruitment-architecture-state.json`, `recruitment-role-requests.json`

## Deployment notes

Systemd unit files and helper scripts are included in the repo. Adapt paths/variables to your server environment.

## License

See `LICENSE`.
