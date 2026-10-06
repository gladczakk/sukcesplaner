/* SukcesPlaner Tailwind preset (v3 `presets: [require('./tailwind.preset.js')]`).
   Colors resolve to CSS variables from tokens.css, so light/dark switch automatically. Import tokens.css once in the app root. */
module.exports = {
  "theme": {
    "extend": {
      "colors": {
        "bg": "var(--bg)",
        "surface": "var(--surface)",
        "river": "var(--river)",
        "line": "var(--line)",
        "ink": "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "jojoba": "var(--jojoba)",
        "jojoba-strong": "var(--jojoba-strong)",
        "jojoba-hover": "var(--jojoba-hover)",
        "on-jojoba": "var(--on-jojoba)",
        "jojoba-soft": "var(--jojoba-soft)",
        "jojoba-ink": "var(--jojoba-ink)",
        "kensington": "var(--kensington)",
        "kensington-soft": "var(--kensington-soft)",
        "kensington-ink": "var(--kensington-ink)",
        "ochre": "var(--ochre)",
        "ochre-soft": "var(--ochre-soft)",
        "ochre-ink": "var(--ochre-ink)",
        "brick": "var(--brick)",
        "on-brick": "var(--on-brick)",
        "brick-soft": "var(--brick-soft)",
        "brick-ink": "var(--brick-ink)",
        "focus": "var(--focus)",
        "project-sage": "var(--project-sage)",
        "project-kensington": "var(--project-kensington)",
        "project-ochre": "var(--project-ochre)",
        "project-brick": "var(--project-brick)",
        "project-teal": "var(--project-teal)",
        "project-sand": "var(--project-sand)"
      },
      "fontFamily": {
        "serif": [
          "var(--font-serif)"
        ],
        "sans": [
          "var(--font-sans)"
        ]
      },
      "spacing": {
        "sp-1": "4px",
        "sp-2": "8px",
        "sp-3": "12px",
        "sp-4": "16px",
        "sp-5": "24px",
        "sp-6": "32px",
        "sp-7": "48px"
      },
      "borderRadius": {
        "sm": "6px",
        "md": "12px",
        "lg": "20px",
        "pill": "999px"
      },
      "boxShadow": {
        "card": "var(--shadow-card)",
        "pop": "var(--shadow-pop)"
      },
      "fontSize": {
        "display": [
          "40px",
          {
            "lineHeight": "44px",
            "fontWeight": "500",
            "letterSpacing": "-0.01em"
          }
        ],
        "title": [
          "28px",
          {
            "lineHeight": "34px",
            "fontWeight": "500"
          }
        ],
        "section": [
          "20px",
          {
            "lineHeight": "26px",
            "fontWeight": "600"
          }
        ],
        "quote": [
          "17px",
          {
            "lineHeight": "24px",
            "fontWeight": "400"
          }
        ],
        "task": [
          "16px",
          {
            "lineHeight": "22px",
            "fontWeight": "500"
          }
        ],
        "body": [
          "15px",
          {
            "lineHeight": "22px",
            "fontWeight": "400"
          }
        ],
        "meta": [
          "13px",
          {
            "lineHeight": "18px",
            "fontWeight": "400"
          }
        ],
        "button": [
          "14px",
          {
            "lineHeight": "20px",
            "fontWeight": "600"
          }
        ],
        "eyebrow": [
          "12px",
          {
            "lineHeight": "16px",
            "fontWeight": "600",
            "letterSpacing": "0.08em"
          }
        ]
      }
    }
  }
};
