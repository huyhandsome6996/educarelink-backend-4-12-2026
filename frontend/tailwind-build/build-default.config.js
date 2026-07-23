const sharedTheme = require('./shared-theme');

// Templates that never set a custom `borderRadius` -> use Tailwind's
// built-in default scale (rounded-lg = 0.5rem, rounded-xl = 0.75rem, etc.)
module.exports = {
  content: [
    '../templates/frontend/browse_candidates.html',
    '../templates/frontend/login.html',
    '../templates/frontend/onboarding_parent.html',
    '../templates/frontend/onboarding_worker.html',
    '../templates/frontend/parent_home.html',
    '../templates/frontend/parent_tasks.html',
    '../templates/frontend/review.html',
    '../templates/frontend/task_detail.html',
    '../templates/frontend/worker_feed.html',
    '../templates/frontend/worker_jobs.html',
    '../templates/frontend/worker_profile.html',
  ],
  theme: {
    extend: {
      colors: sharedTheme.colors,
      fontFamily: sharedTheme.fontFamily,
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
