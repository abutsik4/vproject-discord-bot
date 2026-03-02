<p align="center">
  <img src="assets/readme-logo.svg" alt="VPROJECT" width="640" />
</p>

<p align="center">
  Node.js Discord bot for VPROJECT with recruitment category automation and policy-driven role request workflow.
</p>

## Features

- Recruitment architecture management (channels/roles/pins) driven by `recruitment-architecture.json`
- Discord-only role requests with configurable audience and approver roles (via recruitment workflow policy)
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

This workflow is policy-driven through `recruitment-architecture.json` (`default.workflow` / `guilds.<id>.workflow`).

Default policy in this repo:
- `requestAudience: all_members` (all guild users can create requests)
- `categoryVisibility: public` (category visible to everyone)
- approvals channel remains private by explicit channel overwrite
- approvers include `P| Admin (Full)`, `P| Admin (Mod)`, and `Модератор Discord`

Default channel names (configurable in `recruitment-architecture.json`):
- `📝│запросы-ролей` — request creation
- `🔐│одобрение-ролей` — decisions by configured approver roles

Commands:
- In `📝│запросы-ролей`:
  - `!роль <лидер|зам|база> @user <reason>`
- In `🔐│одобрение-ролей`:
  - `!одобрить <ID>`
  - `!отклонить <ID> <reason>`

## User-facing update (2026-03)

- The role request flow is now open to all server members.
- Category visibility for the recruitment flow is now public.
- `📝│запросы-ролей` is available for submitting requests.
- `🔐│одобрение-ролей` remains private for the moderation workflow.

## One-off setup: create role request category + channels

```bash
node scripts/setup-role-requests-discord.js
```

Requires `.env` with:
- `DISCORD_TOKEN`
- `GUILD_ID`

The script creates the category `🛂│запросы-ролей`, the two text channels, sets permission overwrites, and stores IDs into `data/recruitment-architecture-state.json` (this file is intentionally ignored by git).

Note: this script now delegates to the canonical recruitment manager setup, so permissions stay consistent with policy and WebUI setup behavior.

## WebUI policy management

Open `/recruitment` in WebUI and use **Role Request Workflow Policy** to:
- set request audience (`all_members` or `staff_only`)
- set category visibility (`public` or `restricted`)
- configure additional approver roles by name or by role ID
- optionally apply setup immediately after saving policy

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
