# WebUI Frontend Review (OBT)

## Scope
This review covers the runtime WebUI served by `src/index.js` and related data/API flows used by the panel routes:
- `/`
- `/stats`
- `/embeds`
- `/embeds/:id`
- `/auto-roles`
- POST APIs (`/send-embed`, `/auto-roles`, `/reset-stats`)

## Current Architecture
- Frontend is server-rendered HTML/CSS/JS templates inside `src/index.js`.
- Shared data layer uses JSON files in `data/` (`messages.json`, `embeds.json`, `autoroles.json`).
- No frontend build step; UI changes are direct Node template edits.

## Strengths
- Minimal moving parts and fast iteration.
- Single-process deployment is straightforward.
- Existing `/healthz` endpoint available for service-level checks.

## Risks
- Monolithic template surface in `src/index.js` is easy to break during edits.
- Public admin routes currently rely on network perimeter controls.
- JSON persistence lacks strict schemas and migration/versioning.
- Branding/status text can drift if not centralized.

## OBT Improvements Implemented
- Branding contract centralized in `config.json` (`branding` object).
- Runtime presence, panel title/subtitle, and alert prefixes now consume branding config.
- Command labels moved to branding-aware values for consistency.
- Legacy Alpha labels updated in current embed templates.
- Added `scripts/check-branding.js` and npm script `npm run check:branding`.
- Added WebUI auth middleware (token-based) controlled by `config.webui` / env variables.
- Added POST payload validation hardening for `/send-embed` and `/auto-roles`.
- Added `scripts/smoke-webui.js` and `npm run smoke:webui` for route/API smoke checks.

## Next Recommended Enhancements
### P0
- Add explicit auth middleware for all WebUI + mutating API routes.
- Add request payload validation for all POST endpoints.

### P1
- Split WebUI into modules:
  - `src/web/layout.js`
  - `src/web/routes/*.js`
  - `src/web/services/*.js`
- Add JSON schemas for `data/*.json` and validate at load/save boundaries.

### P2
- Add smoke tests for core routes and form submission flows.
- Expand `/healthz` with writable-data checks and parse-status checks.

## Safe Rollout Checklist
1. Run `npm run check:branding`.
2. Configure `WEBUI_AUTH_TOKEN` (or `config.webui.authToken`) and keep `webui.requireAuth=true`.
3. Run `npm run smoke:webui` with `WEBUI_BASE_URL` and `WEBUI_AUTH_TOKEN` set.
4. Verify `/` sidebar shows `Bot Control Panel (OBT)`.
5. Verify bot presence is `VPROJECT • OBT`.
6. Verify `/help` command description reflects OBT.
7. Verify no user-facing Alpha label remains unless intentionally historical.
