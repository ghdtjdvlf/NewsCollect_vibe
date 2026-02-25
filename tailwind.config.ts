import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: 'rgba(255,255,255,0.08)',
          border: 'rgba(255,255,255,0.2)',
        },
      },
      backdropBlur: {
        glass: '25px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
}

export default config
