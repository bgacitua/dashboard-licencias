/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#135bec",
        "primary-hover": "#0f4ec9",
        "primary-soft": "#e8efff",
        "background-light": "#f6f7fb",
        "background-dark": "#0b111e",
        "surface": "#ffffff",
        "surface-muted": "#f1f3f8",
        "border-subtle": "#e5e7ef",
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)',
        'card-hover': '0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.05)',
        'navbar': '0 1px 0 0 rgba(15, 23, 42, 0.06)',
      },
      borderRadius: {
        'xl2': '0.875rem',
      },
    },
  },
  plugins: [],
}