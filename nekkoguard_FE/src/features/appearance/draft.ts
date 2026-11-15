import {
  COLOR_FIELDS,
  type AppearanceAsset,
  type AppearanceDto,
  type AppearanceField,
  type AppearanceValues,
  type NavbarPosition,
} from '@/api/appearance';
import { DEFAULT_NAVBAR_POSITION, resolveColors } from './theme';

/**
 * Unsaved edits on the Appearance page. Pure functions only (unit-tested).
 * A `null` value means "not set here: inherit".
 */

export type AssetDraft = { kind: 'keep' } | { kind: 'upload'; file: File; preview: string } | { kind: 'remove' };

export interface Draft {
  values: AppearanceValues;
  assets: Record<AppearanceAsset, AssetDraft>;
}

export const FIELDS: readonly AppearanceField[] = ['title', ...COLOR_FIELDS, 'navbar_position'];

export function draftFrom(dto: AppearanceDto): Draft {
  const values = Object.fromEntries(FIELDS.map((field) => [field, dto.configured[field]])) as AppearanceValues;
  return { values, assets: { logo: { kind: 'keep' }, favicon: { kind: 'keep' } } };
}

/** Only what changed, ready for PATCH (`null` = reset to inherited). */
export function changedValues(dto: AppearanceDto, draft: Draft): Partial<AppearanceValues> {
  const changes: Partial<Record<AppearanceField, string | null>> = {};
  for (const field of FIELDS) {
    if (draft.values[field] !== dto.configured[field]) changes[field] = draft.values[field];
  }
  return changes as Partial<AppearanceValues>;
}

export function isDirty(dto: AppearanceDto, draft: Draft): boolean {
  return Object.keys(changedValues(dto, draft)).length > 0 || Object.values(draft.assets).some((a) => a.kind !== 'keep');
}

/** Where a displayed value comes from. */
export type Origin = 'here' | 'tenant' | 'default';

/** "Customized for Acme MSP" / "Inherited from Acme MSP" / "Using NekkoGuard default". */
export function originLabel(scope: 'tenant' | 'organization', origin: Origin, tenantName: string): string {
  if (origin === 'here') return scope === 'tenant' ? `Customized for ${tenantName}` : 'Customized for this organization';
  if (origin === 'tenant' && scope === 'organization') return `Inherited from ${tenantName}`;
  return 'Using NekkoGuard default';
}

export function originOf(own: unknown, inherited: unknown): Origin {
  if (own !== null && own !== undefined) return 'here';
  return inherited !== null && inherited !== undefined ? 'tenant' : 'default';
}

/** Image to show for an asset, given the pending edit (`url` null = NekkoGuard mark/icon). */
export function assetPreview(dto: AppearanceDto, draft: Draft, asset: AppearanceAsset): { url: string | null; origin: Origin } {
  const pending = draft.assets[asset];
  const inheritedUrl = dto.inherited[`${asset}_url`];
  const inherited = { url: inheritedUrl, origin: originOf(null, inheritedUrl) };
  if (pending.kind === 'upload') return { url: pending.preview, origin: 'here' };
  if (pending.kind === 'remove') return inherited;
  return dto.configured[asset] ? { url: dto.effective[`${asset}_url`], origin: 'here' } : inherited;
}

/** Everything the preview needs, as it would look after saving. */
export function previewOf(dto: AppearanceDto, draft: Draft) {
  const own = draft.values;
  const inherited = dto.inherited;
  return {
    colors: resolveColors(own, inherited),
    /** Only non-default colors: the preview applies them exactly like the app does. */
    overrides: Object.fromEntries(COLOR_FIELDS.map((field) => [field, own[field] ?? inherited[field]])),
    title: own.title ?? inherited.title,
    navbarPosition: (own.navbar_position ?? inherited.navbar_position ?? DEFAULT_NAVBAR_POSITION) as NavbarPosition,
    logoUrl: assetPreview(dto, draft, 'logo').url,
  };
}

// ---------------------------------------------------------------- uploads

export const MAX_IMAGE_BYTES = 1024 * 1024;
const ALLOWED_IMAGES: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};
export const IMAGE_ACCEPT = Object.keys(ALLOWED_IMAGES).join(',');

/** Early feedback only — the backend re-validates the type, contents and size. */
export function imageFileError(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const extensions = ALLOWED_IMAGES[file.type];
  if (!extensions?.includes(extension)) return 'Choose a PNG, JPEG or WebP image (SVG is not supported).';
  if (file.size > MAX_IMAGE_BYTES) return 'The image must be 1 MB or smaller.';
  return null;
}
