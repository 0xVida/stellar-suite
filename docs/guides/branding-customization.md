# How-To: Customizing the IDE for your Brand

This guide provides developers with the necessary steps to theme and brand the Stellar Suite IDE for their own projects or white-label use cases.

## 1. Modifying the Theme (Tailwind & CSS Variables)

The IDE uses a hybrid approach for theming: **Tailwind CSS** for layout and components, driven by **CSS Variables** defined in HSL format.

### 1.1 CSS Variable System
Core theme colors are defined in `ide/app/globals.css`. By updating these variables, you can change the look and feel of the entire IDE without modifying component code.

**Verified Theme Variables (Snippet from `globals.css`):**
```css
:root, .dark {
  --background: 220 20% 10%;
  --foreground: 210 20% 90%;
  --primary: 225 73% 62%;
  --accent: 204 63% 34%;
  --border: 220 14% 20%;
  --radius: 0.375rem;
}
```

### 1.2 Customizing Colors
To implement a custom brand color, convert your brand hex code to HSL and update the `--primary` variable:

| Theme Variable | Description |
| :--- | :--- |
| `--background` | Main background color of the IDE |
| `--primary` | Main brand color (buttons, active states) |
| `--accent` | Highlight color for specific UI elements |
| `--sidebar-background` | Background color for the navigation sidebar |

## 2. Replacing Logos and Visual Assets

### 2.1 Brand Logo
The primary application logo is located at `ide/public/icon.png`. To replace it:
1. Prepare a square PNG logo (recommended size: 512x512px).
2. Overwrite `ide/public/icon.png` with your new logo.

### 2.2 PWA and Favicons
If you have modified the main icon, you should regenerate the PWA icons using the included script:

**Verified Command Output:**
```bash
cd ide
node generate-pwa-icons.mjs
```
*This will update `pwa-192x192.png` and `pwa-512x512.png` based on your new `icon.png`.*

## 3. Localizing Text and Project Naming

The IDE's text content, including its name, is managed via `i18next`.

### 3.1 Changing the Application Name
Search for the application name in the localization files located at `ide/public/locales/`.

**Example: Updating English labels (`ide/public/locales/en/translation.json`)**
```json
{
  "app": {
    "name": "My Custom IDE",
    "description": "A tailored blockchain development environment"
  }
}
```

### 3.2 AI Chat Personality
The AI assistant's name and personality are defined in `ide/src/lib/ai-chat.ts`. Update the system prompt to reflect your brand's AI identity.

## 4. Implementation Example: "Stellar Enterprise" Theme

To create a high-contrast corporate blue theme, apply the following variables to `globals.css`:

```css
.dark {
  --primary: 210 100% 50%; /* Deep Blue */
  --background: 210 25% 6%;  /* Near Black Blue */
  --accent: 190 90% 40%;    /* Cyan Accent */
  --radius: 0px;             /* Sharp Corporate Edges */
}
```

---
*Tip: Use the Browser Developer Tools to inspect elements and find the specific CSS variable names for any UI component you wish to customize.*
