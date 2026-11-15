import { apiRequest } from './client';

/**
 * Multi-tenancy API (backend: nekkoguard/organizations/).
 *
 * Every id in these paths is re-checked by the backend against the signed-in user's
 * memberships: knowing an id never grants access. Types mirror the DRF serializers.
 */

// ---------------------------------------------------------------- shared

export type TenantRole = 'admin' | 'member';
export type OrganizationRole = 'admin' | 'security_analyst' | 'operator' | 'viewer';
export type OrganizationAccess = 'all' | 'selected' | 'none';
export type MembershipStatus = 'active' | 'suspended';
export type Effect = 'grant' | 'deny';
export type PermissionSource = 'override' | 'organization_role' | 'tenant_role' | 'none';

export interface UserSummaryDto {
  id: number;
  email: string;
  name: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ActivityEntryDto {
  id: number;
  organization: string | null;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  target_name: string;
  details: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------- tenants

export interface TenantDto {
  id: string;
  name: string;
  description: string;
  /** Where this Tenant's bug reports are emailed; "" = the platform address. */
  support_email: string;
  /** Null for users who only reach Organizations directly (no Tenant membership). */
  role: TenantRole | null;
  permissions: string[];
  /**
   * The caller's organization scope here. Tenant rights (permissions above) apply
   * only to those Organizations — every role, administrators included. Null = not a member.
   */
  organization_access: OrganizationAccess | null;
  /** The Tenant to open when nothing is remembered (backend rules: first Tenant with an
   *  Organization the user can open; the demo Tenant for superusers without memberships). */
  is_default: boolean;
  created_at: string;
}

export interface TenantUpdateDto {
  name?: string;
  description?: string;
  support_email?: string;
}

export interface TenantMembershipDto {
  id: number;
  user: UserSummaryDto;
  role: TenantRole;
  status: MembershipStatus;
  organization_access: OrganizationAccess;
  default_organization_role: OrganizationRole | '';
  selected_organizations: string[];
  /** May the caller edit/remove this member (role rank and organization scope)? */
  can_manage: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantMembershipWriteDto {
  role?: TenantRole;
  status?: MembershipStatus;
  organization_access?: OrganizationAccess;
  default_organization_role?: OrganizationRole | '';
  selected_organizations?: string[];
}

export interface TenantMembershipCreateDto extends Omit<TenantMembershipWriteDto, 'status'> {
  email: string;
  role: TenantRole;
}

// ---------------------------------------------------------------- organizations

export interface OrganizationDto {
  id: string;
  tenant: string;
  name: string;
  description: string;
  is_active: boolean;
  /** Whether the caller reaches this Organization's infrastructure. */
  has_access: boolean;
  /** Whether the caller's Tenant rights apply here (it is in their organization scope). */
  can_administer: boolean;
  created_at: string;
  updated_at: string;
}

/** An Organization the caller can open, in any of their Tenants (organization switcher). */
export interface MyOrganizationDto {
  id: string;
  name: string;
  tenant: string;
  tenant_name: string;
}

export interface DecisionDto {
  permission: string;
  allowed: boolean;
  source: PermissionSource;
}

export interface EffectiveAccessDto {
  user: UserSummaryDto;
  via_tenant: boolean;
  organization_role: OrganizationRole | null;
  inherited_role: OrganizationRole | null;
  permissions: string[];
  decisions: DecisionDto[];
}

export interface OrganizationDetailDto extends OrganizationDto {
  /** The caller's own effective access; null when they only administer it. */
  my_access: EffectiveAccessDto | null;
}

export interface OrganizationWriteDto {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface OrganizationMembershipDto {
  id: number;
  user: UserSummaryDto;
  role: OrganizationRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/** Invitation of someone without an account (the token is never sent to the app). */
export interface OrganizationInvitationDto {
  id: string;
  email: string;
  role: OrganizationRole;
  status: InvitationStatus;
  invited_by: UserSummaryDto | null;
  expires_at: string;
  last_sent_at: string;
  accepted_at: string | null;
  created_at: string;
}

/** "Add member" by email: existing account → added; otherwise → invitation emailed. */
export type AddMemberResultDto =
  | { result: 'added'; membership: OrganizationMembershipDto }
  | { result: 'invited'; invitation: OrganizationInvitationDto };

/** Public view of an emailed invitation link (details only while it is pending). */
export type InvitationLinkDto =
  | {
      status: 'pending';
      email: string;
      organization_name: string;
      invited_by: string;
      role: OrganizationRole;
      expires_at: string;
    }
  | { status: Exclude<InvitationStatus, 'pending'> | 'unavailable' };

export interface InvitationAcceptedDto {
  tenant: string;
  organization: string;
  organization_name: string;
  already_member: boolean;
}

/** Server-side sort of a paginated list: `field` or `-field` (backend allowlist). */
export type Ordering = string;

const pageQuery = (page: number, ordering?: Ordering) =>
  `?page=${page}${ordering ? `&ordering=${encodeURIComponent(ordering)}` : ''}`;

export interface PermissionOverrideDto {
  id: number;
  user: UserSummaryDto;
  permission: string;
  effect: Effect;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------- infrastructure

export interface SiteDto {
  id: string;
  name: string;
  description: string;
  network_count: number;
  created_at: string;
  updated_at: string;
}

export interface SiteWriteDto {
  name: string;
  description?: string;
}

export interface NetworkDto {
  id: string;
  site: string;
  name: string;
  cidr: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface NetworkWriteDto {
  site: string;
  name: string;
  cidr?: string;
  description?: string;
}

// ---------------------------------------------------------------- paths + calls

const tenantPath = (t: string) => `/api/tenants/${encodeURIComponent(t)}/`;
const orgPath = (t: string, o: string) => `${tenantPath(t)}organizations/${encodeURIComponent(o)}/`;

type Signal = AbortSignal | undefined;
const get = <T>(path: string, signal: Signal) => apiRequest<T>(path, signal ? { signal } : {});
const send = <T>(path: string, method: 'POST' | 'PATCH', body: unknown) => apiRequest<T>(path, { method, body });
const remove = (path: string) => apiRequest<null>(path, { method: 'DELETE' });

export const tenancyApi = {
  // Tenants
  listTenants: (signal?: AbortSignal) => get<TenantDto[]>('/api/tenants/', signal),
  listMyOrganizations: (signal?: AbortSignal) => get<MyOrganizationDto[]>('/api/organizations/', signal),
  updateTenant: (t: string, body: TenantUpdateDto) => send<TenantDto>(tenantPath(t), 'PATCH', body),

  listTenantMembers: (t: string, signal?: AbortSignal) =>
    get<TenantMembershipDto[]>(`${tenantPath(t)}members/`, signal),
  addTenantMember: (t: string, body: TenantMembershipCreateDto) =>
    send<TenantMembershipDto>(`${tenantPath(t)}members/`, 'POST', body),
  updateTenantMember: (t: string, id: number, body: TenantMembershipWriteDto) =>
    send<TenantMembershipDto>(`${tenantPath(t)}members/${id}/`, 'PATCH', body),
  removeTenantMember: (t: string, id: number) => remove(`${tenantPath(t)}members/${id}/`),

  tenantActivity: (t: string, page: number, signal?: AbortSignal, ordering?: Ordering) =>
    get<Paginated<ActivityEntryDto>>(`${tenantPath(t)}activity/${pageQuery(page, ordering)}`, signal),

  // Organizations
  listOrganizations: (t: string, signal?: AbortSignal) =>
    get<OrganizationDto[]>(`${tenantPath(t)}organizations/`, signal),
  createOrganization: (t: string, body: OrganizationWriteDto) =>
    send<OrganizationDto>(`${tenantPath(t)}organizations/`, 'POST', body),
  getOrganization: (t: string, o: string, signal?: AbortSignal) => get<OrganizationDetailDto>(orgPath(t, o), signal),
  updateOrganization: (t: string, o: string, body: OrganizationWriteDto) =>
    send<OrganizationDetailDto>(orgPath(t, o), 'PATCH', body),

  listOrganizationMembers: (t: string, o: string, signal?: AbortSignal) =>
    get<OrganizationMembershipDto[]>(`${orgPath(t, o)}members/`, signal),
  /** Email only: the backend adds an existing account (Viewer) or sends an invitation. */
  addOrganizationMember: (t: string, o: string, body: { email: string }) =>
    send<AddMemberResultDto>(`${orgPath(t, o)}members/`, 'POST', body),
  listInvitations: (t: string, o: string, signal?: AbortSignal) =>
    get<OrganizationInvitationDto[]>(`${orgPath(t, o)}invitations/`, signal),
  resendInvitation: (t: string, o: string, id: string) =>
    send<OrganizationInvitationDto>(`${orgPath(t, o)}invitations/${encodeURIComponent(id)}/resend/`, 'POST', {}),
  /** Revokes (the record is kept). */
  revokeInvitation: (t: string, o: string, id: string) => remove(`${orgPath(t, o)}invitations/${encodeURIComponent(id)}/`),

  // Emailed invitation links (the token is the only identifier)
  getInvitationLink: (token: string, signal?: AbortSignal) =>
    get<InvitationLinkDto>(`/api/invitations/${encodeURIComponent(token)}/`, signal),
  acceptInvitation: (token: string) =>
    send<InvitationAcceptedDto>(`/api/invitations/${encodeURIComponent(token)}/accept/`, 'POST', {}),
  updateOrganizationMember: (
    t: string,
    o: string,
    id: number,
    body: { role?: OrganizationRole; status?: MembershipStatus },
  ) => send<OrganizationMembershipDto>(`${orgPath(t, o)}members/${id}/`, 'PATCH', body),
  removeOrganizationMember: (t: string, o: string, id: number) => remove(`${orgPath(t, o)}members/${id}/`),

  listOverrides: (t: string, o: string, signal?: AbortSignal) =>
    get<PermissionOverrideDto[]>(`${orgPath(t, o)}overrides/`, signal),
  /** Creates or changes the override (upsert). */
  setOverride: (t: string, o: string, body: { user: number; permission: string; effect: Effect }) =>
    send<PermissionOverrideDto>(`${orgPath(t, o)}overrides/`, 'POST', body),
  /** Back to INHERIT. */
  removeOverride: (t: string, o: string, id: number) => remove(`${orgPath(t, o)}overrides/${id}/`),

  accessList: (t: string, o: string, signal?: AbortSignal) =>
    get<EffectiveAccessDto[]>(`${orgPath(t, o)}access/`, signal),

  organizationActivity: (t: string, o: string, page: number, signal?: AbortSignal, ordering?: Ordering) =>
    get<Paginated<ActivityEntryDto>>(`${orgPath(t, o)}activity/${pageQuery(page, ordering)}`, signal),

  // Infrastructure
  listSites: (t: string, o: string, signal?: AbortSignal) => get<SiteDto[]>(`${orgPath(t, o)}sites/`, signal),
  createSite: (t: string, o: string, body: SiteWriteDto) => send<SiteDto>(`${orgPath(t, o)}sites/`, 'POST', body),
  updateSite: (t: string, o: string, id: string, body: Partial<SiteWriteDto>) =>
    send<SiteDto>(`${orgPath(t, o)}sites/${id}/`, 'PATCH', body),
  deleteSite: (t: string, o: string, id: string) => remove(`${orgPath(t, o)}sites/${id}/`),

  listNetworks: (t: string, o: string, site: string | null, signal?: AbortSignal) =>
    get<NetworkDto[]>(`${orgPath(t, o)}networks/${site ? `?site=${encodeURIComponent(site)}` : ''}`, signal),
  createNetwork: (t: string, o: string, body: NetworkWriteDto) =>
    send<NetworkDto>(`${orgPath(t, o)}networks/`, 'POST', body),
  updateNetwork: (t: string, o: string, id: string, body: Partial<NetworkWriteDto>) =>
    send<NetworkDto>(`${orgPath(t, o)}networks/${id}/`, 'PATCH', body),
  deleteNetwork: (t: string, o: string, id: string) => remove(`${orgPath(t, o)}networks/${id}/`),
};
