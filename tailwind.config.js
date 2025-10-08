/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          pink: '#FF1CF7',
          cyan: '#62C0EB',
        },
        dark: {
          900: '#0a0118',
          800: '#16171d',
          700: '#1e1f2a',
          600: '#2a2b3a',
        },
      },
      fontFamily: {
        heading: ['Legend Deca', 'sans-serif'],
        body: ['Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(90deg, #FF1CF7 0%, #62C0EB 100%)',
        'gradient-brand-reverse': 'linear-gradient(90deg, #62C0EB 0%, #FF1CF7 100%)',
        'gradient-dark': 'linear-gradient(180deg, #0a0118 0%, #16171d 50%, #1e1f2a 100%)',
        'gradient-mesh': 'radial-gradient(at 20% 30%, rgba(255, 28, 247, 0.15) 0%, transparent 50%), radial-gradient(at 80% 70%, rgba(98, 192, 235, 0.15) 0%, transparent 50%)',
      },
      boxShadow: {
        'glow-pink': '0 0 30px rgba(255, 28, 247, 0.5)',
        'glow-cyan': '0 0 30px rgba(98, 192, 235, 0.5)',
        'glow-brand': '0 0 40px rgba(255, 28, 247, 0.3), 0 0 60px rgba(98, 192, 235, 0.3)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        }
      }
    },
  },
  plugins: [],
}

