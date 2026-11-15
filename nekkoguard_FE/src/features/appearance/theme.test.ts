/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ColorField } from '@/api/appearance';
import {
  ALL_THEME_VARIABLES,
  COLOR_TOKENS,
  contrastRatio,
  contrastWarnings,
  DEFAULT_COLORS,
  DEFAULT_THEME_VARIABLES,
  isolatedThemeVariables,
  normalizeColor,
  themeVariables,
} from './theme';

// Tests run from the frontend root (npm test, CI). CSS is not processed by Vitest, so read the file.
const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const COLOR_FIELDS = Object.keys(DEFAULT_COLORS) as ColorField[];
const tokenValue = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokensCss)?.[1]?.trim();

describe('default appearance', () => {
  it('mirrors tokens.css exactly (the existing NekkoGuard theme)', () => {
    for (const field of COLOR_FIELDS) {
      expect(tokenValue(COLOR_TOKENS[field]), field).toBe(DEFAULT_COLORS[field]);
    }
  });

  it('sets no CSS variable when nothing is configured', () => {
    expect(themeVariables({})).toEqual({});
    expect(themeVariables(Object.fromEntries(COLOR_FIELDS.map((f) => [f, null])))).toEqual({});
  });
});

describe('isolatedThemeVariables (previews)', () => {
  it('defaults every theme variable to its tokens.css value', () => {
    expect(Object.keys(DEFAULT_THEME_VARIABLES).sort()).toEqual([...ALL_THEME_VARIABLES].sort());
    for (const [name, value] of Object.entries(DEFAULT_THEME_VARIABLES)) expect(tokenValue(name), name).toBe(value);
  });

  it('sets every variable so the page theme (another scope) never leaks in', () => {
    const vars = isolatedThemeVariables({ accent_color: '#ff0000' });
    expect(Object.keys(vars).sort()).toEqual([...ALL_THEME_VARIABLES].sort());
    expect(vars['--accent']).toBe('#ff0000');
    expect(vars['--primary']).toBe(DEFAULT_COLORS.primary_color);
  });
});

describe('themeVariables', () => {
  it('sets only the configured token and the tokens derived from it', () => {
    const vars = themeVariables({ accent_color: '#ff0000' });
    expect(vars).toEqual({ '--accent': '#ff0000' });
  });

  it('derives the primary variants so every component follows', () => {
    const vars = themeVariables({ primary_color: '#112233' });
    expect(vars['--primary']).toBe('#112233');
    expect(vars['--primary-subtle']).toContain('#112233');
    expect(vars['--focus-ring']).toBe('0 0 0 2px #0b0b12, 0 0 0 4px #112233');
    expect(vars['--primary-hover']).toBeUndefined(); // independent setting
  });

  it('never produces anything but colors (no CSS injection surface)', () => {
    const vars = themeVariables(Object.fromEntries(COLOR_FIELDS.map((f) => [f, '#abcdef'])));
    for (const value of Object.values(vars)) expect(value).not.toMatch(/[;{}]|url\(|expression/i);
  });
});

describe('normalizeColor', () => {
  it.each([
    ['#7C6CF6', '#7c6cf6'],
    ['#abc', '#aabbcc'],
    ['rgb(124, 108, 246)', '#7c6cf6'],
    [' #000000 ', '#000000'],
  ])('%s → %s', (input, expected) => expect(normalizeColor(input)).toBe(expected));

  it.each(['red', '#12345', '#gggggg', 'rgb(300,0,0)', 'url(x)', 'var(--x)', ''])('rejects %s', (input) =>
    expect(normalizeColor(input)).toBeNull(),
  );
});

describe('contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('accepts the NekkoGuard defaults', () => {
    expect(contrastWarnings(DEFAULT_COLORS)).toEqual([]);
  });

  it('warns about unreadable combinations without changing them', () => {
    const colors = { ...DEFAULT_COLORS, text_color: '#111118' };
    const warnings = contrastWarnings(colors);
    expect(warnings.map((w) => w.id)).toContain('text-bg');
    expect(colors.text_color).toBe('#111118');
  });
});
