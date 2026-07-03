---
name: Deriv dual app-ID architecture (OAuth vs WebSocket)
description: Deriv has two incompatible app-ID systems (alphanumeric OAuth-only vs numeric WebSocket-only); custom domains need both handled separately.
---

## Problem
Deriv's developer dashboard now issues two different kinds of app IDs, and they are NOT interchangeable:
- **Registered apps** — alphanumeric (e.g. `33E5cSHjp6JwZDugdKGGq`). Valid for OAuth/OIDC login redirects only.
- **Legacy app IDs** — numeric (e.g. `36300`, `65555`). Required by the WebSocket trading API (`ws.derivws.com`); confirmed live that the WS server rejects alphanumeric IDs with `{"error":"InvalidAppID"}` (HTTP 401), regardless of Origin header.

Production `dbot.deriv.com` avoids this problem because it has a single legacy numeric ID that supports both flows. Newer custom domains registered via the dashboard's "Registered apps" section only get the alphanumeric, OAuth-only kind — some users may not have access to register a numeric legacy ID at all.

## Fix (dual-ID architecture)
Keep the numeric ID for the WebSocket connection and use the alphanumeric ID only for OIDC login, decoupled via one shared localStorage key:
- `domain_app_ids` (numeric only) → used by `getAppId()` for the WebSocket connection.
- `domain_oauth_app_ids` (alphanumeric) → new map, OAuth-login only.
- `ensureOAuthAppId()` — call right before every `requestOidcAuthentication()` / `OAuth2Logout()` call site; sets `localStorage['config.app_id']` to the domain's alphanumeric ID (this is the same key `@deriv-com/auth-client`'s OIDC library reads internally — there's no other way to override its app_id).
- `getAppId()` was changed to only trust `config.app_id` from localStorage if it's purely numeric (`/^\d+$/`), so the OAuth override set above is automatically ignored by the WS connection logic — no manual reset/cleanup needed after login completes.

**Why:** The OIDC library's `getServerInfo()` reads `client_id` from `localStorage['config.app_id']` with no way to pass an override parameter directly. Since our own WS `getAppId()` checks the same key, splitting by numeric-vs-alphanumeric format lets both coexist safely without any reset logic across the redirect-away-and-back OAuth flow.

**How to apply:** Any new custom domain needing OAuth login must get an entry in `domain_oauth_app_ids` (`src/components/shared/utils/config/config.ts`) with its alphanumeric Registered App ID, redirect URL `https://<domain>/callback`. If the user can obtain a numeric Legacy App ID instead, prefer adding it to `domain_app_ids` instead and skip the dual-ID complexity entirely.
