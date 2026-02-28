# WEBUI Visual Review (27 Feb 2026)

## Strengths
- Clear module navigation and predictable route structure.
- Consistent dark/glass visual language.
- Reusable interaction patterns (toast, active nav, form controls).
- Data-dense pages are functional and scannable.
- Good baseline for iterative improvements.

## P0 Issues
- Sidebar still uses placeholder logo block instead of real brand asset.
- No favicon in shell head, reducing product identity in tabs/bookmarks.
- Bot status mismatch can go unnoticed without explicit presence diagnostics.

## P1 Issues
- Dense inline styles reduce consistency and maintainability.
- Secondary text contrast is weak in some cards/hints.
- Destructive actions need stronger visual separation.
- Mobile sidebar can feel crowded in horizontal mode.

## P2 Issues
- Minor spacing/radius inconsistencies across components.
- Emoji nav icons are functional but not strongly brand-aligned.
- Heavy gradient layering can reduce clarity over long sessions.

## Accessibility Improvements
- Strengthen focus-visible styles on links/buttons/inputs.
- Improve muted-text contrast to WCAG AA where needed.
- Ensure decorative icons are aria-hidden.
- Add aria-live behavior for toast notifications.
- Avoid nested label patterns in toggle controls.

## Quick Wins (1 hour)
- Add real logo + favicon and wire in shell.
- Slightly increase muted text contrast and line-height.
- Improve dangerous action affordance in stats reset flow.
- Normalize spacing/radius for primary controls.

## Medium Backlog (Next Sprint)
- Extract common inline styles into reusable classes/tokens.
- Improve responsive nav ergonomics for narrow screens.
- Add visual regression snapshots for core routes.
- Introduce UI checklist gate for AI-driven edits.
