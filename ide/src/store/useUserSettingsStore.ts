import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'es' | 'zh' | 'pt' | 'ar';

export type TerminalTheme = 'default' | 'monokai' | 'solarized-dark' | 'dracula' | 'gruvbox';

export const TERMINAL_THEMES = {
  default: {
    background: "#0d1117",
    foreground: "#e6edf3",
    cursor: "#58a6ff",
    cursorAccent: "#0d1117",
    black: "#484f58",
    red: "#ff7b72",
    green: "#3fb950",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    white: "#b1bac4",
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#56d364",
    brightYellow: "#e3b341",
    brightBlue: "#79c0ff",
    brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd",
    brightWhite: "#f0f6fc",
    selectionBackground: "#264f78",
  },
  monokai: {
    background: "#272822",
    foreground: "#f8f8f2",
    cursor: "#f8f8f0",
    cursorAccent: "#272822",
    black: "#272822",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#f4bf75",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#f8f8f2",
    brightBlack: "#75715e",
    brightRed: "#f92672",
    brightGreen: "#a6e22e",
    brightYellow: "#f4bf75",
    brightBlue: "#66d9ef",
    brightMagenta: "#ae81ff",
    brightCyan: "#a1efe4",
    brightWhite: "#f9f8f5",
    selectionBackground: "#49483e",
  },
  'solarized-dark': {
    background: "#002b36",
    foreground: "#839496",
    cursor: "#839496",
    cursorAccent: "#002b36",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#002b36",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
    selectionBackground: "#073642",
  },
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f0",
    cursorAccent: "#282a36",
    black: "#000000",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#bfbfbf",
    brightBlack: "#4d4d4d",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
    selectionBackground: "#44475a",
  },
  gruvbox: {
    background: "#282828",
    foreground: "#ebdbb2",
    cursor: "#ebdbb2",
    cursorAccent: "#282828",
    black: "#282828",
    red: "#cc241d",
    green: "#98971a",
    yellow: "#d79921",
    blue: "#458588",
    magenta: "#b16286",
    cyan: "#689d6a",
    white: "#a89984",
    brightBlack: "#928374",
    brightRed: "#fb4934",
    brightGreen: "#b8bb26",
    brightYellow: "#fabd2f",
    brightBlue: "#83a598",
    brightMagenta: "#d3869b",
    brightCyan: "#8ec07c",
    brightWhite: "#ebdbb2",
    selectionBackground: "#3c3836",
  },
};

export interface HslToken {
  h: number;
  s: number;
  l: number;
}

export interface BrandThemeTokens {
  primary: HslToken;
  secondary: HslToken;
  background: HslToken;
}

const DEFAULT_BRAND_THEME: BrandThemeTokens = {
  primary: { h: 225, s: 73, l: 62 },
  secondary: { h: 220, s: 16, l: 18 },
  background: { h: 220, s: 20, l: 10 },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toCssHsl = (token: HslToken) => `${token.h} ${token.s}% ${token.l}%`;

const textTone = (token: HslToken) => (token.l > 45 ? '220 20% 8%' : '210 20% 96%');

export function applyBrandThemeTokens(tokens: BrandThemeTokens) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  const background = tokens.background;
  const primary = tokens.primary;
  const secondary = tokens.secondary;

  root.style.setProperty('--background', toCssHsl(background));
  root.style.setProperty('--foreground', textTone(background));

  root.style.setProperty('--primary', toCssHsl(primary));
  root.style.setProperty('--primary-foreground', textTone(primary));

  root.style.setProperty('--secondary', toCssHsl(secondary));
  root.style.setProperty('--secondary-foreground', textTone(secondary));

  root.style.setProperty('--card', toCssHsl({ ...background, l: clamp(background.l + 3, 5, 96) }));
  root.style.setProperty('--card-foreground', textTone(background));
  root.style.setProperty('--popover', toCssHsl({ ...background, l: clamp(background.l + 5, 5, 96) }));
  root.style.setProperty('--popover-foreground', textTone(background));
  root.style.setProperty('--muted', toCssHsl({ ...background, l: clamp(background.l + 6, 5, 96) }));
  root.style.setProperty('--muted-foreground', toCssHsl({ ...background, l: clamp(background.l + 46, 35, 92) }));
  root.style.setProperty('--border', toCssHsl({ ...background, l: clamp(background.l + 10, 8, 94) }));
  root.style.setProperty('--input', toCssHsl({ ...background, l: clamp(background.l + 10, 8, 94) }));
  root.style.setProperty('--ring', toCssHsl(primary));
  root.style.setProperty('--sidebar-background', toCssHsl({ ...background, l: clamp(background.l - 2, 4, 90) }));
  root.style.setProperty('--sidebar-border', toCssHsl({ ...background, l: clamp(background.l + 8, 8, 94) }));
}

interface UserSettingsState {
  theme: Theme;
  language: Language;
  brandTheme: BrandThemeTokens;
  fontSize: number;
  formatOnSave: boolean;
  experimentalLocalBuild: boolean;
  terminalTheme: TerminalTheme;
  terminalFontFamily: string;
  terminalFontSize: number;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setBrandTheme: (brandTheme: BrandThemeTokens) => void;
  setFontSize: (fontSize: number) => void;
  setFormatOnSave: (formatOnSave: boolean) => void;
  setExperimentalLocalBuild: (enabled: boolean) => void;
  setTerminalTheme: (terminalTheme: TerminalTheme) => void;
  setTerminalFontFamily: (fontFamily: string) => void;
  setTerminalFontSize: (fontSize: number) => void;
}

export const useUserSettingsStore = create<UserSettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      language: 'en',
      brandTheme: DEFAULT_BRAND_THEME,
      fontSize: 14,
      formatOnSave: true,
      experimentalLocalBuild: false,
      terminalTheme: 'default',
      terminalFontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
      terminalFontSize: 12,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setBrandTheme: (brandTheme) => {
        applyBrandThemeTokens(brandTheme);
        set({ brandTheme });
      },
      setFontSize: (fontSize) => set({ fontSize }),
      setFormatOnSave: (formatOnSave) => set({ formatOnSave }),
      setExperimentalLocalBuild: (experimentalLocalBuild) => set({ experimentalLocalBuild }),
      setTerminalTheme: (terminalTheme) => set({ terminalTheme }),
      setTerminalFontFamily: (terminalFontFamily) => set({ terminalFontFamily }),
      setTerminalFontSize: (terminalFontSize) => set({ terminalFontSize }),
    }),
    {
      name: 'user-settings',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      })),
      onRehydrateStorage: () => (state) => {
        if (state?.brandTheme) {
          applyBrandThemeTokens(state.brandTheme);
        }
      },
    }
  )
);
