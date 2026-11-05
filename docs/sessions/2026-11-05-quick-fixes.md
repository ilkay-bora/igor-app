# 2026-11-05: Pre-public quick fixes

Item 4 of "Before going public" in the roadmap.

## Sign-in without APP_TOKEN

- `src/lib/local-token.ts`: `getAppToken()` returns `APP_TOKEN` if set (desktop shell, `.env.local`), else reads or creates a random token in `data/local-token`. `isValidToken()` compares in constant time.
- `proxy.ts` and `/api/login` use it, so a fresh `npm run dev` checkout no longer has an unusable login screen.
- `src/instrumentation.ts` prints `IGOR sign-in: http://localhost:<port>/login?token=...` at startup (skipped under the desktop shell, which signs itself in).
- The login page signs in automatically when opened with `?token=`, and says where the token lives.
- Verified: dev server with no `.env.local` on port 3011, wrong token 401, right token 200, link lands on `next`.

## Bundled font

- `apps/studio/assets/fonts/Inter-Regular.ttf`, `Inter-Bold.ttf` from rsms/inter v4.1, license in `Inter-OFL.txt`.
- `editor-render.ts` draws all text (overlays, strips, title cards) with Inter Bold. Overlays used to render with regular Arial while the preview showed bold, so rendered text was thinner than what was laid out; now both are bold Inter.
- Editor preview text uses `var(--font-sans)` (the app's Inter) instead of Arial.
- `editor-strip.ts` `CHAR_EM` 0.62 to 0.63 (Inter Bold capitals are about 1.5% wider than Arial Bold).
- Verified with a test render: Turkish characters (Ç Ğ İ Ş Ö Ü ı) correct in overlay and strip.
