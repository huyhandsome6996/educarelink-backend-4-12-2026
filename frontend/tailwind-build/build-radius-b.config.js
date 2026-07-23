const sharedTheme = require('./shared-theme');

// register.html is the only template with this radius scale:
// DEFAULT 0.75rem, md 0.875rem, lg 1.25rem, xl 1.75rem, 2xl 2rem
module.exports = {
  content: [
    '../templates/frontend/register.html',
  ],
  theme: {
    extend: {
      colors: sharedTheme.colors,
      fontFamily: sharedTheme.fontFamily,
      borderRadius: {
        DEFAULT: '0.75rem',
        md: '0.875rem',
        lg: '1.25rem',
        xl: '1.75rem',
        '2xl': '2rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
