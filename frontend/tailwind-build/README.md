# Tailwind build (replaces the old CDN script tag)

`frontend/templates/frontend/*.html` used to load Tailwind via
`<script src="https://cdn.tailwindcss.com">`, which compiles CSS **in the
browser on every page load** — slow, and explicitly not recommended for
production by Tailwind's own docs. This folder compiles it ahead of time
into static `.css` files instead, served normally via Django's static files
(WhiteNoise) with no runtime compilation.

## Why 4 output files instead of 1

Auditing all 19 templates found they were built with 3 genuinely different
custom `borderRadius` scales (not typos — real, visible differences in how
rounded corners/buttons look), plus one template (`tracking.html`) that
never customized the theme at all. To avoid silently changing the look of
any page, each group gets its own compiled bundle instead of forcing one
shared scale on everyone:

| Bundle | Used by | borderRadius |
|---|---|---|
| `tailwind-default.css` | 11 templates that never set a custom scale | Tailwind's built-in defaults |
| `tailwind-radius-a.css` | chatbot, help_center, splash, task_create_1/2, worker_chatbot | `DEFAULT 0.75rem, lg 1rem, xl 1.5rem, 2xl 2rem` |
| `tailwind-radius-b.css` | register.html only | `DEFAULT 0.75rem, md 0.875rem, lg 1.25rem, xl 1.75rem, 2xl 2rem` |
| `tailwind-plain.css` | tracking.html only | plain Tailwind, no theme extension, no plugins |

Colors and font families were consistent across templates (two near-duplicate
hex values were found and canonicalized — see the comment at the top of
`shared-theme.js`), so those are shared across all 4 configs.

## Rebuilding after a template change

If you add/remove Tailwind utility classes in any of the 19 templates, or
change a template's local color/radius values, rebuild:

```bash
cd frontend/tailwind-build
npm install       # first time only
npm run build     # regenerates all 4 files in ../static/css/
```

Then commit the updated files under `frontend/static/css/`. There is no
build step on Render itself (the deploy environment is Python-only) — the
compiled CSS is committed directly to the repo like any other static asset.

If you add a *new* template that needs Tailwind, decide which bundle it
belongs with (or create a new one), add it to the relevant `content: [...]`
array in the matching `build-*.config.js`, rebuild, and add
`<link rel="stylesheet" href="{% static 'css/<bundle>.css' %}">` (plus
`{% load static %}` at the top of the template if it's not already there).
