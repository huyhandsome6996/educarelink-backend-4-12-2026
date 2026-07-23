const sharedTheme = require('./shared-theme');

// Templates that set: DEFAULT 0.75rem, lg 1rem, xl 1.5rem, 2xl 2rem
// (splash.html additionally set full: '9999px', which is identical to
// Tailwind's own default for `rounded-full` -- no-op, kept for clarity.)
module.exports = {
  content: [
    '../templates/frontend/chatbot.html',
    '../templates/frontend/help_center.html',
    '../templates/frontend/splash.html',
    '../templates/frontend/task_create_1.html',
    '../templates/frontend/task_create_2.html',
    '../templates/frontend/worker_chatbot.html',
  ],
  theme: {
    extend: {
      colors: sharedTheme.colors,
      fontFamily: sharedTheme.fontFamily,
      borderRadius: {
        DEFAULT: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '2rem',
        full: '9999px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
