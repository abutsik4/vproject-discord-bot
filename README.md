<p align="center">
  <img src="assets/readme-logo.svg" alt="VPROJECT" width="640" />
</p>

<p align="center">
  Node.js Discord bot for VPROJECT — recruitment automation, button-based role requests, and a web management panel.
</p>

## Features

- **Button-based role request system** — interactive panel with Discord buttons + modal forms
- **Approve / Deny workflow** — one-click buttons on request embeds for moderators
- **`/pending_requests` slash command** — paginated view of open requests with status filter
- **Auto-expiry** — stale requests expire automatically after 7 days
- **Audit logging** — structured embed logs for every approval, denial and expiry
- **WebUI panel settings** — customise button labels and descriptions from the browser
- Recruitment architecture management driven by `recruitment-architecture.json`
- Configurable workflow policy (audience, visibility, approver roles)
- Auto-roles, message tracking, giveaway templates
- PM2-based production deployment with health checks

## Quick start

### 1) Install

```bash
npm ci
```

### 2) Configure environment

```bash
cp .env.example .env
```

Required variables:
- `DISCORD_TOKEN`
- `GUILD_ID`

### 3) Register slash commands

```bash
npm run register
```

### 4) Run

Development:

```bash
npm start
```

Production (PM2):

```bash
pm2 start ecosystem.config.js
pm2 save
```

## Role request system

The role request flow uses **Discord buttons and modal forms** — no text commands required.

### How it works

1. A **panel embed** is posted in `📝│запросы-ролей` with one button per role pack (Лидер, Заместитель, Участник).
2. A member clicks a button → a **modal form** pops up asking for the target user and reason.
3. The bot creates a request embed in `🔐│одобрение-ролей` with **Approve** and **Deny** buttons.
4. A moderator clicks **Approve** to grant the role, or **Deny** to open a reason modal.
5. The original requester is notified in-channel and the request embed is updated.

### Auto-expiry & audit

- Requests older than **7 days** are automatically expired.
- Every action (approve, deny, expire) is recorded via a structured audit-log embed.

### `/pending_requests` command

Moderators can run `/pending_requests` (optionally filtering by status) to see a paginated list of open requests.

### Legacy text commands (deprecated)

The old `!роль` / `!одобрить` / `!отклонить` text commands still work but are **not recommended**. Use the button-based panel instead.

## One-off setup

### Create role request category + channels

```bash
node scripts/setup-role-requests-discord.js
```

Creates the category, text channels, permission overwrites, and stores IDs in `data/recruitment-architecture-state.json`.

### Update recruitment channel embeds

```bash
node scripts/update-recruitment-embeds.js
```

Sends or refreshes the standardised info embeds in all five recruitment channels.

## WebUI

The bot exposes a web panel on port **5011** (configurable via `config.json`).

### Role Request Panel settings

Open `/recruitment` → **Role Request Panel** section to:
- Edit button **labels** and **descriptions** for each role pack
- Save & automatically resend the panel embed with updated text

### Workflow policy

Open `/recruitment` → **Role Request Workflow Policy** to:
- Set request audience (`all_members` / `staff_only`)
- Set category visibility (`public` / `restricted`)
- Configure approver roles
- Apply setup immediately

### Message templates

Open `/recruitment` → **Шаблоны сообщений** to customise automated messages (request creation, approval, denial).

## Project structure

```
src/
  index.js                 — main bot + web panel
  registerCommands.js      — slash command registration
  commands/                — slash & admin commands
  utils/
    embedFactory.js
    recruitmentArchitectureManager.js
    telegram.js
data/                      — runtime state (git-ignored)
scripts/                   — one-off setup & maintenance scripts
ecosystem.config.js        — PM2 configuration
```

## Security

- Never commit `.env` (tokens, passwords)
- Git-ignored runtime files: `data/`, `logs/`, `backups/`, `node_modules/`

## Deployment

PM2 is the recommended process manager:

```bash
pm2 start ecosystem.config.js
pm2 save
```

Systemd unit files (`vproject-bot.service`, `vproject-bot-healthcheck.*`) and helper scripts (`bot.sh`, `24-7-start.sh`) are included for VPS deployment. Adapt paths to your environment.

## License

See `LICENSE`.
