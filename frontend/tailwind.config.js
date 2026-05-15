module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', "sans-serif"],
        heading: ['"Space Grotesk"', "sans-serif"],
        mono: ['"Space Mono"', "monospace"],
      },
      colors: {
        background: "hsl(220, 24%, 8%)",
        foreground: "hsl(0, 0%, 98%)",
        border: "hsl(220, 12%, 18%)",
        input: "hsl(220, 18%, 12%)",
        ring: "hsl(192, 92%, 60%)",
        primary: {
          DEFAULT: "hsl(250, 66%, 60%)",
          foreground: "hsl(0, 0%, 100%)",
          hover: "hsl(250, 66%, 50%)",
          active: "hsl(250, 66%, 45%)",
        },
        secondary: {
          DEFAULT: "hsl(250, 66%, 40%)",
          foreground: "hsl(0, 0%, 100%)",
          hover: "hsl(250, 66%, 35%)",
          active: "hsl(250, 66%, 30%)",
        },
        tertiary: {
          DEFAULT: "hsl(200, 20%, 25%)",
          foreground: "hsl(0, 0%, 95%)",
        },
        accent: {
          DEFAULT: "hsl(192, 92%, 55%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        muted: {
          DEFAULT: "hsl(220, 18%, 12%)",
          foreground: "hsl(220, 9%, 45%)",
        },
        card: {
          DEFAULT: "hsl(220, 18%, 12%)",
          foreground: "hsl(0, 0%, 98%)",
        },
        popover: {
          DEFAULT: "hsl(220, 18%, 12%)",
          foreground: "hsl(0, 0%, 98%)",
        },
        success: {
          DEFAULT: "hsl(152, 65%, 45%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        warning: {
          DEFAULT: "hsl(40, 90%, 55%)",
          foreground: "hsl(0, 0%, 10%)",
        },
        error: {
          DEFAULT: "hsl(0, 80%, 60%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        info: {
          DEFAULT: "hsl(210, 90%, 60%)",
          foreground: "hsl(0, 0%, 100%)",
        },
        neutral: {
          50: "hsl(220, 15%, 95%)",
          100: "hsl(220, 14%, 90%)",
          200: "hsl(220, 12%, 75%)",
          300: "hsl(220, 10%, 55%)",
          400: "hsl(220, 9%, 45%)",
          500: "hsl(220, 8%, 35%)",
          600: "hsl(220, 10%, 25%)",
          700: "hsl(220, 12%, 18%)",
          800: "hsl(220, 18%, 12%)",
          900: "hsl(220, 24%, 8%)",
        },
        "long-color": "hsl(152, 65%, 45%)",
        "short-color": "hsl(0, 80%, 60%)",
      },
      backgroundImage: {
        "gradient-primary":
          "linear-gradient(135deg, hsl(250, 66%, 55%) 0%, hsl(192, 92%, 55%) 100%)",
        "gradient-secondary":
          "linear-gradient(135deg, hsl(250, 66%, 45%) 0%, hsl(192, 92%, 45%) 100%)",
        "gradient-accent":
          "linear-gradient(135deg, hsl(192, 92%, 60%) 0%, hsl(162, 65%, 45%) 100%)",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        full: "9999px",
      },
      boxShadow: {
        sm: "0 2px 4px hsl(0, 0%, 0% / 0.25)",
        md: "0 4px 8px hsl(0, 0%, 0% / 0.3)",
        lg: "0 6px 16px hsl(0, 0%, 0% / 0.35)",
        xl: "0 8px 24px hsl(0, 0%, 0% / 0.4)",
        "card-hover": "0 12px 32px hsl(250, 66%, 40% / 0.2)",
        "primary-btn": "0 4px 12px hsl(250, 66%, 30% / 0.4)",
      },
      letterSpacing: {
        heading: "-0.025em",
      },
      animation: {
        "slide-in-right": "slideInRight 0.25s ease-out",
        "slide-down": "slideDown 0.2s ease-out",
        "count-up": "countUp 0.4s ease-out",
        "fade-in": "fadeIn 0.2s ease-in-out",
        "spin-slow": "spin 2s linear infinite",
      },
      keyframes: {
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        countUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
