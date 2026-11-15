import { apiRequest } from './client';

/**
 * White-label appearance API (backend: nekkoguard/organizations/api/appearance.py).
 *
 * `null` always means "not configured here": the value is inherited
 * (Organization → Tenant → NekkoGuard default). The backend never sends the
 * NekkoGuard defaults; they live only in `src/styles/tokens.css`.
 */

export type NavbarPosition = 'left' | 'top' | 'right';
export type AppearanceSource = 'organization' | 'tenant' | 'default';
export type AppearanceAsset = 'logo' | 'favicon';

export const COLOR_FIELDS = [
  'primary_color',
  'primary_hover_color',
  'secondary_color',
  'accent_color',
  'background_color',
  'surface_color',
  'sidebar_color',
  'text_color',
  'text_muted_color',
  'border_color',
  'success_color',
  'warning_color',
  'danger_color',
] as const;
export type ColorField = (typeof COLOR_FIELDS)[number];

export type AppearanceField = 'title' | ColorField | 'navbar_position';

/** Plain settings (no images): `null` = inherit. */
export type AppearanceValues = { title: string | null; navbar_position: NavbarPosition | null } & Record<
  ColorField,
  string | null
>;

/** Values plus versioned, authenticated image URLs (`null` = no image at this level). */
export type ResolvedValues = AppearanceValues & { logo_url: string | null; favicon_url: string | null };

export interface AppearanceDto {
  scope: 'tenant' | 'organization';
  /** What this scope sets itself. `logo`/`favicon`: whether it has its own image. */
  configured: AppearanceValues & { logo: boolean; favicon: boolean };
  /** What each property falls back to when not configured here. */
  inherited: ResolvedValues;
  /** What is shown to users of this scope. */
  effective: ResolvedValues;
  sources: Record<AppearanceField | AppearanceAsset, AppearanceSource>;
  can_manage: boolean;
  updated_at: string | null;
}

type Signal = AbortSignal | undefined;

/** Base path of a Tenant (orgId null) or Organization appearance. */
export function appearancePath(tenantId: string, orgId: string | null): string {
  const tenant = `/api/tenants/${encodeURIComponent(tenantId)}`;
  return orgId ? `${tenant}/organizations/${encodeURIComponent(orgId)}/appearance/` : `${tenant}/appearance/`;
}

export const appearanceApi = {
  get: (tenantId: string, orgId: string | null, signal?: Signal) =>
    apiRequest<AppearanceDto>(appearancePath(tenantId, orgId), signal ? { signal } : {}),
  update: (tenantId: string, orgId: string | null, values: Partial<AppearanceValues>) =>
    apiRequest<AppearanceDto>(appearancePath(tenantId, orgId), { method: 'PATCH', body: values }),
  reset: (tenantId: string, orgId: string | null) =>
    apiRequest<AppearanceDto>(appearancePath(tenantId, orgId), { method: 'DELETE' }),
  uploadAsset: (tenantId: string, orgId: string | null, asset: AppearanceAsset, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest<{ hash: string }>(`${appearancePath(tenantId, orgId)}${asset}/`, { method: 'PUT', body: form });
  },
  removeAsset: (tenantId: string, orgId: string | null, asset: AppearanceAsset) =>
    apiRequest<{ hash: null }>(`${appearancePath(tenantId, orgId)}${asset}/`, { method: 'DELETE' }),
};
