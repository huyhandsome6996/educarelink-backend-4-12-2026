# QA Bug Report — EduCareLink (2026-07-23)

**Tester:** Claude (Anthropic)
**Scope:** Backend (Django), Web frontend (Django templates), Mobile app (React Native/Expo). **Payments module excluded at the repo owner's request** — see note below.
**Method:** See "Testing methodology & limitations" below — this was **static/code-level QA plus a fully isolated local run**, not manual clicking on the live Render deployment.

> **Payments (MoMo/PayOS) is intentionally out of scope for this pass.** The repo owner is actively finishing PayOS account setup and considering dropping MoMo entirely (its merchant registration process is too tedious), so the payments module was left untouched — not tested, not fixed. The previous pass's payments finding has been moved to "Deferred — payments module" below rather than treated as an open bug.

---

## Testing methodology & limitations (read this first)

To avoid any risk to the live Render service or its database, I did **not** run tests against `https://educarelink-backend.onrender.com` and made **no write requests** to it at all — no logins, no POSTs, no load. Everything below was done in a disposable, offline sandbox:

- Cloned the repo, installed `requirements.txt` into a fresh virtualenv.
- Copied the whole project again into a second, throwaway directory so the copy running the dev server could never touch the files I'd push back to GitHub.
- Ran `manage.py check`, `manage.py makemigrations --check`, `manage.py migrate`, and `manage.py test` against a local SQLite copy.
- Started the Django dev server locally (`127.0.0.1`, not Render) and hit every URL pattern (all web pages + all `{% url %}` template tags) to confirm they resolve without server errors.
- Syntax-checked all 59 mobile `.js` files with `node --check`.
- Cross-referenced every `fetch()`/`apiFetch()` call in the admin dashboard template, and the mobile app's API client, against the real Django URL patterns to find dead links.
- Read through `core/views.py`, `moderation/services.py`, and `mobile/src/api/client.js` for logic issues.
- **Second pass:** ran `pyflakes` across every non-payments app (`core`, `moderation`, `tracking`, `ai_recommendations`, `performance`, `frontend`, `backend`) to catch unused/dead code and undefined names, then manually reviewed each hit that looked like it could be a real functional bug (most were harmless unused imports — those are omitted below since they're not worth anyone's time).

**What I could not do**, and want to be upfront about:
- I have no phone/emulator or Expo runtime here, so I could not literally launch the mobile app and tap through every screen.
- I have no browser automation tool in this environment, so I did not click buttons in a live rendered browser session — I verified routes/links resolve and traced the JS logic instead.
- I did not touch the live Render deployment or its Postgres database at all, so this report doesn't cover anything that only manifests under production data/load (e.g. Gemini API quota issues, cold-start timing).

If you want true click-through UI/mobile QA, that needs either a human tester or an agent with browser/device automation (e.g. Claude Code + Playwright, or Claude for Chrome) — I flagged this as an action item in the fix-it prompt below.

---

## Summary

| Severity | Count |
|---|---|
| High | 1 |
| Medium | 3 |
| Low | 2 |
| Deferred (payments, not tested) | 1 |

No crashes, no 500 errors, no broken page routes were found. All 4 previously-reported "web page 404" and "send-notification 400" issues (from `TEST_REPORT_2026_07_21.md`) were re-verified and confirmed to be **test-script mistakes, not real bugs** (the real routes are `/parent/` and `/worker/`, not `/parent/home/` / `/worker/feed/`; the real param is `send_to_all`, not `recipient_type`) — nothing in the actual code references the wrong paths.

---

## BUG-01 (High): Committed SQLite database contains real user PII, despite being gitignored

- **Component:** repo root, `db.sqlite3`
- **Finding:** `.gitignore` lists `db.sqlite3`, but the file is still tracked in git (`git ls-files` shows it) and has been modified across 10 commits. The committed database currently contains 15 user rows, including real-looking emails and phone numbers (e.g. a personal Gmail address, phone numbers like `0901234567`), plus password hashes.
- **Why it matters:** Anyone with read access to this repo (and its full git history — deleting the file later does *not* remove it from history) can see real user data and password hashes. If this repo is or ever becomes public, that's a PII/security leak.
- **Fix:**
  1. Stop tracking it going forward: `git rm --cached db.sqlite3` and commit.
  2. Scrub it from git history with `git filter-repo` (or BFG Repo-Cleaner), then force-push and have all collaborators re-clone.
  3. Rotate any credentials that might be reused (test account passwords, etc.).
  4. Production already correctly uses Postgres via `DATABASE_URL`, so this file isn't used live — it's purely a dev artifact that leaked in.

---

## BUG-02 (Medium): Mobile app's global API timeout (10s) is shorter than real chatbot response times (9.5–12s)

- **Component:** `mobile/src/api/client.js`
- **Finding:** `axios.create({ ..., timeout: 10000 })` applies a single 10-second timeout to *every* API call, including `/chatbot/` and `/worker/chatbot/`. The team's own `TEST_REPORT_2026_07_21.md` measured these endpoints at 9.58s and **11.79s** respectively (Gemini API latency). Any chatbot response over 10s will throw an `ECONNABORTED` timeout in the app, even though the backend request is still succeeding.
- **Why it matters:** Real users on the mobile app will intermittently see the chatbot "fail" with a timeout/network error for a request that actually completed fine server-side — worse, since there's no retry/backoff, it just looks broken.
- **Fix:** Either (a) give chatbot-specific requests a longer timeout (e.g. 20-25s) via a per-request `axios` override, or (b) move the chatbot response to be delivered asynchronously (poll/callback) like task-moderation already does, so the client isn't blocked on a single long HTTP call.

---

## BUG-03 (Medium): Missing migration in `moderation` app

- **Component:** `moderation` app
- **Finding:** `manage.py makemigrations --check --dry-run` reports pending model changes (Meta `options`/index renames and several field alterations on `Complaint` and `TaskModeration`) that have no corresponding migration file yet.
- **Why it matters:** This means the models in code and the latest migration are out of sync. It works today only because SQLite/Postgres tolerate the drift, but it will bite the next time someone runs a strict migration check in CI, or when the schema actually needs the change enforced (e.g. new DB, or `--check` in a pre-commit hook).
- **Fix:** Run `python manage.py makemigrations moderation`, review the generated migration, and commit it.

---

## BUG-04 (Medium): Admin "clear recommendations cache" endpoint is a no-op

- **Component:** `ai_recommendations/views.py`, `ClearRecommendationsCacheAPIView`
- **Finding:** `POST /api/ai/recommendations/clear-cache/` accepts `worker_id`/`task_id` params, but the handler's actual clearing logic is `if worker_id: pass` — it does nothing, then unconditionally returns a `200` with the message "Cache clear request received. Cache sẽ tự expire sau TTL." The endpoint always reports success without ever deleting a cache key.
- **Why it matters:** Anyone calling this (an admin fixing a bad recommendation, or another part of the app after data changes) is told the cache was cleared when it wasn't — it silently relies on the 3–5 minute TTL to eventually catch up. If there's a UI button for this, it's misleading the person who clicks it into thinking their action had an immediate effect.
- **Fix:** Either implement real key deletion (e.g. build the same cache key the recommendation views use, from `worker_id`/`task_id`, and call `cache.delete()` on it), or be honest in the response that no immediate action was taken and the TTL is the only mechanism — don't imply the clear happened.

---

## BUG-05 (Low): Dead code — `DEV_IP` constant in mobile API client is unused

- **Component:** `mobile/src/api/client.js`
- **Finding:** The file defines `const DEV_IP = '192.168.1.31'` with a comment instructing developers to update it for local testing, but `BASE_URL` is hardcoded to `PROD_URL` (`const BASE_URL = PROD_URL;`), so `DEV_IP` is never actually used.
- **Why it matters:** Minor, but it's misleading — a new developer following the comment to "update your IP" will do so and nothing will change, because the app always talks to the live Render backend regardless of environment. This also means there's no easy way to point the mobile app at a local backend for testing without editing this file directly.
- **Fix:** Either remove the dead `DEV_IP` constant, or wire it up properly behind an env flag (e.g. `if (__DEV__) BASE_URL = DEV_URL`) so local development is actually possible.

---

## BUG-06 (Low): Dead `geofence_warned` flag in tracking service

- **Component:** `tracking/services.py`, geofence-exit handling
- **Finding:** When a Carepartner leaves the safe zone, the code sets a local variable `geofence_warned = True` that is never read again anywhere. The actual push notification still fires correctly via `_notify_user(...)` right below it, so this doesn't cause any missed alerts — it's just leftover/incomplete code, possibly a half-finished attempt to deduplicate repeated warnings.
- **Why it matters:** Not user-facing today, but it's a landmine for a future refactor: someone could reasonably assume `geofence_warned` is doing something (like suppressing duplicate alerts) and build on that false assumption.
- **Fix:** Either remove the unused variable, or finish the intended logic (e.g. store it on the `LiveLocation` row like `geofence_warned_at` already does, and use it to avoid re-notifying every poll cycle while still outside the zone).

---

## Deferred — payments module (not tested this pass, per repo owner's request)

- **Status:** Out of scope. The repo owner is finishing PayOS account setup and considering dropping MoMo, so the payments module (`payments/` app, `payments/tests/`, MoMo/PayOS client code) was **not tested and not fixed** in this pass.
- **Carried over from the previous report, for when this is back in scope:** `payments/tests/test_integration.py` (205 lines) sits in a `payments/tests/` directory with no `__init__.py`, so Django's test runner doesn't discover it — `manage.py test` finds 0 tests project-wide. Once the PayOS/MoMo decision is finalized, this is worth revisiting: add the missing `__init__.py`, run the suite for the first time, and see what it turns up.

---

## Confirmed non-issues (re-verified from prior reports)

These were listed as failures in earlier test runs but are test-script bugs, not app bugs — confirmed by reading the actual URL/view code:

- `/parent/home/` and `/worker/feed/` returning 404 — the real routes are `/parent/` and `/worker/` (test script had wrong path).
- `POST /api/admin/send-notification/` returning 400 — the API correctly expects `send_to_all=true`; the test script sent `recipient_type=all` instead.

---

*Report generated by static analysis + isolated local run only. No changes were made to the live Render service or its database.*
