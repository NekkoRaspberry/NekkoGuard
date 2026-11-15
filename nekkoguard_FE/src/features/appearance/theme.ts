import type { AppearanceValues, ColorField, NavbarPosition } from '@/api/appearance';

/**
 * Appearance → CSS custom properties. Pure functions only.
 *
 * Guarantee: with nothing configured, `themeVariables()` returns `{}` — no inline
 * variable is set and every component keeps using `src/styles/tokens.css` exactly as
 * before. `theme.test.ts` checks that `DEFAULT_COLORS` still matches tokens.css.
 */

/** The current NekkoGuard ("Night Console") values, mirrored from tokens.css. */
export const DEFAULT_COLORS: Record<ColorField, string> = {
  primary_color: '#7c6cf6',
  primary_hover_color: '#8e80ff',
  secondary_color: '#2a2a3a',
  accent_color: '#22d3ee',
  background_color: '#0b0b12',
  surface_color: '#13131d',
  sidebar_color: '#0e0e17',
  text_color: '#ececf3',
  text_muted_color: '#6e6e82',
  border_color: '#2a2a3a',
  success_color: '#3ddc84',
  warning_color: '#f5b83d',
  danger_color: '#f0475b',
};

export const DEFAULT_TITLE = 'NekkoGuard';
export const DEFAULT_NAVBAR_POSITION: NavbarPosition = 'left';

/** The main token each setting replaces (other tokens are derived from it below). */
export const COLOR_TOKENS: Record<ColorField, string> = {
  primary_color: '--primary',
  primary_hover_color: '--primary-hover',
  secondary_color: '--secondary',
  accent_color: '--accent',
  background_color: '--bg-app',
  surface_color: '--surface-1',
  sidebar_color: '--bg-sidebar',
  text_color: '--text-primary',
  text_muted_color: '--text-muted',
  border_color: '--border-default',
  success_color: '--success',
  warning_color: '--warning',
  danger_color: '--danger',
};

export const COLOR_LABELS: Record<ColorField, string> = {
  primary_color: 'Primary',
  primary_hover_color: 'Primary hover',
  secondary_color: 'Secondary',
  accent_color: 'Accent',
  background_color: 'Main background',
  surface_color: 'Surface / cards',
  sidebar_color: 'Sidebar / navbar',
  text_color: 'Main text',
  text_muted_color: 'Muted text',
  border_color: 'Borders',
  success_color: 'Success',
  warning_color: 'Warning',
  danger_color: 'Error / danger',
};

const mix = (color: string, percent: number, other = 'transparent') => `color-mix(in srgb, ${color} ${percent}%, ${other})`;

/**
 * CSS variables for the configured colors only. Tokens derived from a color
 * (hover/pressed/subtle variants, focus ring, shadows) follow it so components stay
 * consistent without knowing about appearance at all.
 */
export function themeVariables(values: Partial<Record<ColorField, string | null>>): Record<string, string> {
  const vars: Record<string, string> = {};
  const set = (field: ColorField) => values[field] ?? null;

  for (const [field, token] of Object.entries(COLOR_TOKENS) as [ColorField, string][]) {
    const value = set(field);
    if (value) vars[token] = value;
  }

  const primary = set('primary_color');
  if (primary) {
    vars['--primary-pressed'] = mix(primary, 85, '#000000');
    vars['--primary-subtle'] = mix(primary, 14);
    vars['--glow-card'] = `radial-gradient(120% 80% at 0% 0%, ${mix(primary, 10)}, transparent 60%)`;
  }
  const background = set('background_color');
  if (primary || background) {
    vars['--focus-ring'] =
      `0 0 0 2px ${background ?? DEFAULT_COLORS.background_color}, 0 0 0 4px ${primary ?? DEFAULT_COLORS.primary_color}`;
  }
  const surface = set('surface_color');
  if (surface) {
    vars['--surface-2'] = mix(surface, 96, '#ffffff');
    vars['--surface-3'] = mix(surface, 91, '#ffffff');
    vars['--surface-elevated'] = mix(surface, 95, '#ffffff');
  }
  const text = set('text_color');
  if (text) vars['--text-secondary'] = mix(text, 72);
  const muted = set('text_muted_color');
  if (muted) vars['--text-disabled'] = mix(muted, 65);
  const border = set('border_color');
  if (border) {
    vars['--border-subtle'] = mix(border, 70);
    vars['--border-strong'] = mix(border, 88, '#ffffff');
    vars['--shadow-nav'] = `inset -1px 0 0 ${mix(border, 70)}`;
    vars['--shadow-2'] = `0 4px 12px rgba(0, 0, 0, 0.45), 0 0 0 1px ${border}`;
    vars['--shadow-3'] = `0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px ${border}`;
  }
  for (const status of ['success', 'warning', 'danger'] as const) {
    const value = set(`${status}_color`);
    if (value) vars[`--${status}-subtle`] = mix(value, 14);
  }
  return vars;
}

/** Every variable `themeVariables` may set (to remove them all on a context switch). */
export const ALL_THEME_VARIABLES: readonly string[] = Object.keys(
  themeVariables(Object.fromEntries(Object.keys(DEFAULT_COLORS).map((k) => [k, '#000000']))),
);

/**
 * tokens.css values of every variable `themeVariables` may set (checked by theme.test.ts).
 * The page itself already shows the *current* Organization's theme, so a preview cannot
 * rely on "not set = default": it would show that Organization's colors instead.
 */
export const DEFAULT_THEME_VARIABLES: Readonly<Record<string, string>> = {
  ...Object.fromEntries((Object.keys(COLOR_TOKENS) as ColorField[]).map((field) => [COLOR_TOKENS[field], DEFAULT_COLORS[field]])),
  '--primary-pressed': '#6a5ae0',
  '--primary-subtle': 'rgba(124, 108, 246, 0.14)',
  '--glow-card': 'radial-gradient(120% 80% at 0% 0%, rgba(124, 108, 246, 0.1), transparent 60%)',
  '--focus-ring': '0 0 0 2px #0b0b12, 0 0 0 4px #7c6cf6',
  '--surface-2': '#191925',
  '--surface-3': '#20202e',
  '--surface-elevated': '#1b1b28',
  '--text-secondary': '#a3a3b5',
  '--text-disabled': '#4a4a5c',
  '--border-subtle': '#1f1f2b',
  '--border-strong': '#3a3a4e',
  '--shadow-nav': 'inset -1px 0 0 #1f1f2b',
  '--shadow-2': '0 4px 12px rgba(0, 0, 0, 0.45), 0 0 0 1px #2a2a3a',
  '--shadow-3': '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px #2a2a3a',
  '--success-subtle': 'rgba(61, 220, 132, 0.14)',
  '--warning-subtle': 'rgba(245, 184, 61, 0.14)',
  '--danger-subtle': 'rgba(240, 71, 91, 0.14)',
};

/** Every theme variable, for an element that must ignore the page's theme (previews). */
export function isolatedThemeVariables(values: Partial<Record<ColorField, string | null>>): Record<string, string> {
  return { ...DEFAULT_THEME_VARIABLES, ...themeVariables(values) };
}

// ---------------------------------------------------------------- colors

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f]{3})$/i;
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;

/** `#rgb`, `#rrggbb` or `rgb(r, g, b)` → lowercase `#rrggbb`; null when invalid (same rules as the backend). */
export function normalizeColor(input: string): string | null {
  const value = input.trim();
  let match = HEX6.exec(value);
  if (match?.[1]) return `#${match[1].toLowerCase()}`;
  match = HEX3.exec(value);
  if (match?.[1]) return `#${[...match[1].toLowerCase()].map((c) => c + c).join('')}`;
  match = RGB.exec(value);
  if (match) {
    const channels = match.slice(1, 4).map(Number);
    if (channels.every((c) => c <= 255)) return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio (1–21) between two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastWarning {
  id: string;
  message: string;
  ratio: number;
}

/** Combinations people actually read, with the WCAG AA minimum for each. */
export function contrastWarnings(colors: Record<ColorField, string>): ContrastWarning[] {
  const checks: [string, string, string, string, number][] = [
    ['text-bg', 'Main text on the main background', colors.text_color, colors.background_color, 4.5],
    ['text-surface', 'Main text on cards', colors.text_color, colors.surface_color, 4.5],
    ['text-sidebar', 'Main text on the sidebar / navbar', colors.text_color, colors.sidebar_color, 4.5],
    ['muted-surface', 'Muted text on cards', colors.text_muted_color, colors.surface_color, 3],
    ['button', 'White button text on the primary color', '#ffffff', colors.primary_color, 3],
  ];
  return checks
    .map(([id, label, fg, bg, min]) => ({ id, label, ratio: contrastRatio(fg, bg), min }))
    .filter(({ ratio, min }) => ratio < min)
    .map(({ id, label, ratio, min }) => ({
      id,
      ratio,
      message: `${label}: contrast ${ratio.toFixed(1)}:1 (at least ${min}:1 recommended).`,
    }));
}

/** Colors as they will look: value set here → inherited → NekkoGuard default. */
export function resolveColors(
  own: Partial<Record<ColorField, string | null>>,
  inherited: Partial<Record<ColorField, string | null>>,
): Record<ColorField, string> {
  return Object.fromEntries(
    (Object.keys(DEFAULT_COLORS) as ColorField[]).map((field) => [field, own[field] ?? inherited[field] ?? DEFAULT_COLORS[field]]),
  ) as Record<ColorField, string>;
}

/** Effective values with `null` replaced by the NekkoGuard default (for display). */
export function withDefaults(values: AppearanceValues): Required<{ [K in keyof AppearanceValues]: NonNullable<AppearanceValues[K]> }> {
  return {
    ...resolveColors(values, {}),
    title: values.title ?? DEFAULT_TITLE,
    navbar_position: values.navbar_position ?? DEFAULT_NAVBAR_POSITION,
  };
}
