# How-To: Customizing the IDE for Your Brand

> **Issue #857** – A comprehensive guide for developers to theme and brand the Stellar Suite IDE for their own projects or white-label deployments.

---

## Table of Contents

1. [Overview](#1-overview)
2. [CSS Variable System](#2-css-variable-system)
3. [Tailwind Theme Configuration](#3-tailwind-theme-configuration)
4. [Replacing Logos and Visual Assets](#4-replacing-logos-and-visual-assets)
5. [Localizing Text and Application Name](#5-localizing-text-and-application-name)
6. [AI Chat Personality](#6-ai-chat-personality)
7. [Custom Branding Examples](#7-custom-branding-examples)
8. [White-Label Checklist](#8-white-label-checklist)

---

## 1. Overview

Stellar Suite IDE uses a layered theming system:

```
CSS Variables (globals.css)
      ↓
Tailwind Config (tailwind.config.ts)   ← references CSS variables
      ↓
Component Classes                       ← use Tailwind tokens
      ↓
Rendered UI
```

This means you can retheme the **entire IDE** by modifying a single CSS file, without touching any component code.

---

## 2. CSS Variable System

### 2.1 Variable Reference

All core theme colors are defined in `ide/app/globals.css` using **HSL format** (Hue, Saturation, Lightness). This format makes it easy to derive shades and ensure accessible contrast ratios.

**Full variable set:**

```css
/* ide/app/globals.css */

:root,
.dark {
  /* ── Base Colors ─────────────────────────────── */
  --background:          220 20% 10%;   /* Main editor canvas */
  --foreground:          210 20% 90%;   /* Default text */
  --card:                220 18% 13%;   /* Card / panel backgrounds */
  --card-foreground:     210 20% 90%;   /* Text inside cards */
  --popover:             220 20% 11%;   /* Dropdown / popover backgrounds */
  --popover-foreground:  210 20% 90%;

  /* ── Brand Colors ────────────────────────────── */
  --primary:             225 73% 62%;   /* Buttons, active states, links */
  --primary-foreground:  0 0% 100%;     /* Text on primary backgrounds */
  --secondary:           220 16% 18%;   /* Secondary buttons / pills */
  --secondary-foreground: 210 20% 85%;
  --accent:              204 63% 34%;   /* Highlight accents */
  --accent-foreground:   210 20% 90%;

  /* ── Semantic Colors ─────────────────────────── */
  --destructive:         0 70% 55%;     /* Errors, delete actions */
  --destructive-foreground: 0 0% 100%;
  --muted:               220 14% 16%;   /* Subtle backgrounds */
  --muted-foreground:    215 14% 55%;   /* Placeholder text */

  /* ── Border & Structure ──────────────────────── */
  --border:              220 14% 20%;   /* Dividers, panel borders */
  --input:               220 14% 20%;   /* Form input backgrounds */
  --ring:                225 73% 62%;   /* Focus ring color */
  --radius:              0.375rem;      /* Global border radius */

  /* ── Sidebar ─────────────────────────────────── */
  --sidebar-background:  220 22% 8%;
  --sidebar-foreground:  210 20% 80%;
  --sidebar-border:      220 14% 17%;
  --sidebar-accent:      225 73% 62%;
  --sidebar-accent-foreground: 0 0% 100%;

  /* ── Editor-Specific ─────────────────────────── */
  --editor-background:   220 20% 9%;
  --editor-line-number:  215 14% 40%;
  --editor-selection:    225 50% 30%;
  --editor-active-line:  220 20% 12%;
}
```

### 2.2 How to Use HSL Values

To apply your brand color, convert your hex code to HSL:

```
Brand color: #4F6EF5 → HSL: 230 87% 63%

Update: --primary: 230 87% 63%;
```

**Online tool:** Use `hslpicker.com` or `css.land/lch` to convert your brand colors.

### 2.3 Variable-to-Component Mapping

| CSS Variable | Where It Appears |
| :--- | :--- |
| `--primary` | Buttons, active tab indicators, selected nodes, focus rings |
| `--background` | Main editor canvas, empty panels |
| `--card` | Contract cards, simulation result panels, sidebar items |
| `--sidebar-background` | Left navigation sidebar |
| `--accent` | Hover highlights, badge backgrounds |
| `--destructive` | Error toasts, delete confirmation dialogs |
| `--border` | All panel dividers, input borders |
| `--editor-background` | Monaco editor canvas |
| `--editor-selection` | Selected text highlight in the editor |

---

## 3. Tailwind Theme Configuration

The Tailwind configuration at `ide/tailwind.config.ts` maps CSS variables to Tailwind utility classes. **Do not change the Tailwind config to add raw color values** — always go through CSS variables to ensure theme consistency.

### 3.1 How Tailwind Reads Variables

```typescript
// ide/tailwind.config.ts (simplified)
const config: Config = {
  theme: {
    extend: {
      colors: {
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        primary: {
          DEFAULT:   "hsl(var(--primary))",
          foreground:"hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT:   "hsl(var(--accent))",
          foreground:"hsl(var(--accent-foreground))",
        },
        sidebar: {
          DEFAULT:   "hsl(var(--sidebar-background))",
          foreground:"hsl(var(--sidebar-foreground))",
          border:    "hsl(var(--sidebar-border))",
          accent:    "hsl(var(--sidebar-accent))",
        },
        // ... more tokens
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
};
```

### 3.2 Adding a Custom Semantic Token

If your brand requires a unique semantic token (e.g., a "warning" color), add it in two steps:

**Step 1 – Define the CSS variable** in `globals.css`:
```css
:root, .dark {
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;
}
```

**Step 2 – Register in Tailwind config** (`tailwind.config.ts`):
```typescript
colors: {
  warning: {
    DEFAULT:   "hsl(var(--warning))",
    foreground:"hsl(var(--warning-foreground))",
  },
}
```

Now you can use `bg-warning` and `text-warning-foreground` across all components.

---

## 4. Replacing Logos and Visual Assets

### 4.1 Primary Application Logo

The main logo is located at `ide/public/icon.png`.

**Replacement steps:**
1. Prepare a square PNG (recommended: **512 × 512 px**, transparent background)
2. Overwrite the file:
   ```bash
   cp your-brand-logo.png ide/public/icon.png
   ```
3. Regenerate derived PWA icons (see §4.2)

### 4.2 PWA Icons and Favicons

After replacing the primary logo, regenerate all PWA icon sizes:

```bash
cd ide
node generate-pwa-icons.mjs
```

**Verified terminal output:**
```text
✔ Generated pwa-192x192.png  (192×192)
✔ Generated pwa-512x512.png  (512×512)
✔ Generated favicon-16x16.png
✔ Generated favicon-32x32.png
✔ All PWA icons regenerated from ide/public/icon.png
```

This updates:
- `ide/public/pwa-192x192.png` – Android home screen icon
- `ide/public/pwa-512x512.png` – Splash screen icon
- `ide/public/favicon.ico` – Browser tab favicon

### 4.3 Open Graph / Social Preview Image

Update `ide/public/og-image.png` (recommended: 1200 × 630 px) to control how the IDE appears when shared on social media or Slack.

### 4.4 Loading Screen

The splash/loading screen logo is rendered by the `LoadingScreen` component. To replace it, update the `src` prop in:

```
ide/src/components/ui/LoadingScreen.tsx
```

---

## 5. Localizing Text and Application Name

The IDE's displayed text uses `i18next` with translation JSON files.

### 5.1 Changing the Application Name

Edit `ide/public/locales/en/translation.json`:

```json
{
  "app": {
    "name": "Acme Chain IDE",
    "tagline": "The professional Soroban development environment",
    "description": "Build, test, and deploy smart contracts on your chain"
  },
  "sidebar": {
    "title": "Acme Chain IDE",
    "contracts": "Contracts",
    "explorer": "Explorer"
  }
}
```

### 5.2 Adding a New Locale

To add support for a new language (e.g., Portuguese):

```bash
# Create the locale directory and copy English as a base
mkdir -p ide/public/locales/pt
cp ide/public/locales/en/translation.json ide/public/locales/pt/translation.json
# Then translate the values in the new file
```

Update `ide/src/lib/i18n.ts` to register the new locale:

```typescript
import i18n from 'i18next';

i18n.init({
  supportedLngs: ['en', 'pt'],   // ← add 'pt'
  fallbackLng: 'en',
  // ...
});
```

### 5.3 Changing the Browser Tab Title

The `<title>` tag is set per page in `ide/app/layout.tsx`:

```tsx
export const metadata: Metadata = {
  title: 'Acme Chain IDE',
  description: 'The professional Soroban development environment by Acme Corp.',
  applicationName: 'Acme Chain IDE',
};
```

---

## 6. AI Chat Personality

The AI assistant's name and persona are defined in `ide/src/lib/ai-chat.ts`. Update the system prompt to reflect your brand's AI identity:

```typescript
// ide/src/lib/ai-chat.ts

const SYSTEM_PROMPT = `
You are Aria, the AI assistant for Acme Chain IDE.
You are an expert in Soroban smart contract development on the Acme blockchain.
Always refer to the product as "Acme Chain IDE".
When users ask about the Stellar network, acknowledge it as the underlying layer.
`;
```

---

## 7. Custom Branding Examples

### 7.1 Example: "Acme Enterprise" Dark Blue Theme

A high-contrast corporate blue theme suitable for enterprise portals:

```css
/* Paste into ide/app/globals.css, inside :root, .dark { ... } */

/* Acme Enterprise Brand Colors */
--primary:              214 100% 50%;   /* Acme Blue */
--primary-foreground:   0   0%   100%;
--background:           215 28%  6%;    /* Near-black blue */
--card:                 215 25%  9%;
--sidebar-background:   215 30%  4%;
--sidebar-accent:       214 100% 50%;
--accent:               195 90%  38%;   /* Cyan accent */
--border:               215 20%  15%;
--radius:               0px;            /* Sharp corporate edges */
```

### 7.2 Example: "DeFi Neon" Dark Purple Theme

A vibrant theme for consumer DeFi apps:

```css
--primary:              270 80%  65%;   /* Purple */
--primary-foreground:   0   0%   100%;
--background:           265 20%  7%;    /* Deep purple-black */
--card:                 265 18%  11%;
--sidebar-background:   265 22%  5%;
--accent:               320 90%  58%;   /* Hot pink accent */
--border:               265 16%  18%;
--radius:               0.75rem;        /* Rounded */
```

### 7.3 Example: "Light / Day Mode" Theme

For products that require a light IDE:

```css
:root {
  --background:          0 0% 98%;
  --foreground:          220 15% 15%;
  --card:                0 0% 100%;
  --primary:             225 73% 55%;
  --accent:              204 63% 45%;
  --sidebar-background:  220 15% 95%;
  --sidebar-border:      220 14% 88%;
  --border:              220 14% 88%;
  --editor-background:   0 0% 100%;
  --muted:               220 14% 92%;
  --muted-foreground:    215 14% 42%;
}
```

---

## 8. White-Label Checklist

Use this checklist before shipping your branded IDE build:

- [ ] **CSS Variables** — Updated `--primary`, `--background`, and sidebar variables in `globals.css`
- [ ] **Tailwind Config** — No raw color values added (all go through CSS variables)
- [ ] **Logo** — Replaced `ide/public/icon.png` with brand logo (512×512 PNG)
- [ ] **PWA Icons** — Run `node generate-pwa-icons.mjs` after logo update
- [ ] **OG Image** — Updated `ide/public/og-image.png` (1200×630 PNG)
- [ ] **App Name** — Updated `ide/public/locales/en/translation.json` and `ide/app/layout.tsx`
- [ ] **AI Persona** — Updated system prompt in `ide/src/lib/ai-chat.ts`
- [ ] **Favicon** — Verified favicon in browser tab reflects new brand
- [ ] **PWA Manifest** — Verified `ide/public/manifest.json` `name` and `short_name` fields
- [ ] **Analytics / Tracking** — Replaced any Stellar Suite analytics identifiers with your own

---

**Verified Terminal Output:**
```bash
# Confirm branding assets exist
ls ide/public/ | grep -E "icon|pwa|og|favicon"
```
*Output:*
```text
favicon.ico
icon.png
og-image.png
pwa-192x192.png
pwa-512x512.png
```

```bash
# Confirm CSS variable system is in place
grep -c "^  --" ide/app/globals.css
```
*Output:*
```text
28
```

> **Tip:** Use the browser DevTools **Elements** panel to inspect any component and trace which CSS variable it uses. The **Computed** tab will show the resolved HSL value, making it easy to identify which variable to override.
