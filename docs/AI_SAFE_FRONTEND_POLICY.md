# AI-Safe Frontend Change Policy

## Goal
Allow agentic AIs to update the WebUI safely while minimizing breakage and enabling quick recovery.

## Ownership Map
- Runtime entrypoint and web routes: `src/index.js`
- Command text surfaces: `src/commands/**`
- Embed/footer rendering contract: `src/utils/embedFactory.js`
- Persistent UI data: `data/embeds.json`, `data/autoroles.json`, `data/messages.json`
- Branding source of truth: `config.json` (`branding`, `footerText`)

## Required Rules for Any AI Edit
1. Do not hardcode project status labels in code when a config key exists.
2. Keep UI route behavior unchanged unless the task explicitly changes UX.
3. Keep data format backward-compatible for `data/*.json`.
4. If changing user-visible strings, update all related surfaces in same change set.
5. Run `npm run check:branding` before handoff.

## Guardrails
- `config.json` is canonical for:
  - `branding.name`
  - `branding.phase`
  - `branding.presence`
  - `branding.panelTitle`
  - `branding.panelHeaderTitle`
  - `branding.panelHeaderSubtitle`
  - `branding.panelOverviewSubtitle`
  - `branding.alertPrefix`
- WebUI access control:
  - Keep `config.webui.requireAuth=true` for public environments.
  - Set secret via `WEBUI_AUTH_TOKEN` (preferred) or `config.webui.authToken`.
  - Optional override: `WEBUI_REQUIRE_AUTH=true|false`.
- `src/utils/embedFactory.js` must use config-derived fallback text.
- New UI modules must preserve existing endpoint URLs.

## Recovery Procedure (If UI Breaks)
1. Check process logs and `/healthz` output.
2. Run `npm run check:branding` to detect config/string drift.
3. Run `npm run smoke:webui` to verify route behavior and auth protection.
4. Validate JSON files in `data/` (syntax + required fields).
5. Roll back only the last UI-affecting commit/change if needed.
6. Re-run smoke navigation:
   - `/`
   - `/stats`
   - `/embeds`
   - `/auto-roles`

## Definition of Done for AI Frontend Changes
- No hardcoded obsolete phase labels in runtime surfaces.
- Branding values resolved from `config.json`.
- Existing routes still render and mutating forms still submit.
- Checklist in `docs/WEBUI_REVIEW_OBT.md` passes.
