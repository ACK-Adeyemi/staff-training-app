// Theme presets (brief 19.4; M3 assumption 51). Each preset passes validateTheme against its own base. Names are
// en-GB.json keys under themes.presets. The bases mirror the text, button text and background of the light and dark app.
import type { ThemeBase, ThemeTokens } from '@sta/domain';

export const themeBases: { light: ThemeBase; dark: ThemeBase } = {
  light: { text: '#1a1a1a', buttonText: '#ffffff', background: '#ffffff' },
  dark: { text: '#f2f2f2', buttonText: '#101010', background: '#121212' },
};

export interface ThemePreset {
  id: string;
  nameKey: string;
  mode: 'light' | 'dark';
  tokens: ThemeTokens;
}

const light = (id: string, primary: string, accent: string, backgroundTint: string): ThemePreset => ({
  id,
  nameKey: `themes.presets.${id}`,
  mode: 'light',
  tokens: { primary, accent, backgroundTint, radius: 'md' },
});

export const themePresets: ThemePreset[] = [
  light('defaultLight', '#1f5fa8', '#0b7a5c', '#f3f7fb'),
  {
    id: 'defaultDark',
    nameKey: 'themes.presets.defaultDark',
    mode: 'dark',
    tokens: { primary: '#8ab4f8', accent: '#7fd1b9', backgroundTint: '#1e2733', radius: 'md' },
  },
  light('christmas', '#b3202a', '#1e7a3c', '#fbf1f1'),
  light('halloween', '#b34700', '#5b3a9a', '#fbf3ea'),
  light('easter', '#6b4aa0', '#b8620b', '#f7f3fb'),
  light('newYear', '#1c2f6e', '#8a6a00', '#f3f4fa'),
  light('spring', '#2f7d32', '#c2185b', '#f2f9f0'),
  light('summer', '#0a6f8f', '#b45f06', '#eff8fb'),
  light('bonfireNight', '#a63a00', '#4a4a8a', '#fbf2ec'),
  light('diwali', '#9c2a6b', '#a86400', '#fcf3f8'),
  light('eid', '#0b6b57', '#8a5a00', '#f0f8f6'),
];
