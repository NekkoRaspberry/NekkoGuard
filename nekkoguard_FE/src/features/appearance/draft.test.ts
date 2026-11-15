// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { appearanceDto } from './testing';
import { assetPreview, changedValues, draftFrom, imageFileError, isDirty, originOf, previewOf } from './draft';
import { DEFAULT_COLORS } from './theme';

describe('draft', () => {
  it('starts clean from the configured values', () => {
    const dto = appearanceDto({ configured: { title: 'Acme' } });
    const draft = draftFrom(dto);
    expect(draft.values.title).toBe('Acme');
    expect(isDirty(dto, draft)).toBe(false);
    expect(changedValues(dto, draft)).toEqual({});
  });

  it('sends only what changed, null meaning "inherit again"', () => {
    const dto = appearanceDto({ configured: { title: 'Acme', primary_color: '#111111' } });
    const draft = draftFrom(dto);
    draft.values.title = null;
    draft.values.accent_color = '#00ff00';
    expect(changedValues(dto, draft)).toEqual({ title: null, accent_color: '#00ff00' });
    expect(isDirty(dto, draft)).toBe(true);
  });

  it('a pending image makes the draft dirty', () => {
    const dto = appearanceDto();
    const draft = draftFrom(dto);
    draft.assets.logo = { kind: 'remove' };
    expect(isDirty(dto, draft)).toBe(true);
  });
});

describe('inheritance in the editor', () => {
  it('labels where a value comes from', () => {
    expect(originOf('#111111', '#222222')).toBe('here');
    expect(originOf(null, '#222222')).toBe('tenant');
    expect(originOf(null, null)).toBe('default');
  });

  it('organization override > tenant > NekkoGuard default, per color', () => {
    const dto = appearanceDto({
      scope: 'organization',
      configured: { primary_color: '#aa0000' },
      inherited: { primary_color: '#00aa00', accent_color: '#0000aa' },
    });
    const { colors, overrides } = previewOf(dto, draftFrom(dto));
    expect(colors.primary_color).toBe('#aa0000');
    expect(colors.accent_color).toBe('#0000aa');
    expect(colors.danger_color).toBe(DEFAULT_COLORS.danger_color);
    expect(overrides.danger_color).toBeNull(); // default → no variable in the preview
  });

  it('removing an own logo previews the inherited one', () => {
    const dto = appearanceDto({
      scope: 'organization',
      configured: { logo: true },
      effective: { logo_url: '/org-logo' },
      inherited: { logo_url: '/tenant-logo' },
    });
    const draft = draftFrom(dto);
    expect(assetPreview(dto, draft, 'logo')).toEqual({ url: '/org-logo', origin: 'here' });
    draft.assets.logo = { kind: 'remove' };
    expect(assetPreview(dto, draft, 'logo')).toEqual({ url: '/tenant-logo', origin: 'tenant' });
  });
});

describe('imageFileError', () => {
  it.each([
    ['logo.png', 'image/png'],
    ['logo.JPG', 'image/jpeg'],
    ['logo.webp', 'image/webp'],
  ])('accepts %s', (name, type) => expect(imageFileError({ name, type, size: 1000 })).toBeNull());

  it.each([
    ['logo.svg', 'image/svg+xml'],
    ['logo.png', 'image/svg+xml'],
    ['logo.jpg', 'image/png'],
    ['logo.gif', 'image/gif'],
  ])('rejects %s (%s)', (name, type) => expect(imageFileError({ name, type, size: 1000 })).not.toBeNull());

  it('rejects files over 1 MB', () => {
    expect(imageFileError({ name: 'a.png', type: 'image/png', size: 1024 * 1024 + 1 })).toMatch(/1 MB/);
  });
});
