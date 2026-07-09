import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;
