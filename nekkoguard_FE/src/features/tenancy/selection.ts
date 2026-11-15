/**
 * The context selection (Tenant → Organization → Site → Network) as pure functions.
 *
 * The selection is kept in memory (TenancyProvider) and remembered per user
 * (storage.ts) — never in the URL. A requested id is never proof of authorization:
 * `resolveSelection` keeps only ids the backend listed for the current user, and the
 * backend re-checks every request anyway.
 */

export interface Selection {
  tenant: string | null;
  org: string | null;
  site: string | null;
  network: string | null;
}

export type Level = keyof Selection;

export const LEVELS: readonly Level[] = ['tenant', 'org', 'site', 'network'];

export const EMPTY_SELECTION: Selection = { tenant: null, org: null, site: null, network: null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Changes one level and resets every level below it (its old values belong to another parent). */
export function changeSelection(current: Selection, level: Level, value: string | null): Selection {
  const index = LEVELS.indexOf(level);
  const next: Selection = { ...current, [level]: value };
  for (const child of LEVELS.slice(index + 1)) next[child] = null;
  return next;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  return LEVELS.every((level) => a[level] === b[level]);
}

/** What the backend says the user may select. `undefined` = not loaded yet. */
export interface SelectionOptions {
  tenants: readonly string[] | undefined;
  /** Organizations of the selected Tenant that the user reaches. */
  organizations: readonly string[] | undefined;
  /** Sites of the selected Organization (undefined also when the user may not view sites). */
  sites: readonly string[] | undefined;
  /** Network id → site id, for the selected Organization. */
  networks: ReadonlyMap<string, string> | undefined;
  /** Tenant the backend marks as the default (used when nothing is requested or remembered). */
  defaultTenant?: string | null;
}

/** Remembered last choices (localStorage); used when nothing was chosen in this tab yet. */
export interface SelectionDefaults {
  tenant: string | null;
  /** Last Organization per Tenant. */
  orgByTenant: Readonly<Record<string, string>>;
}

export interface Resolution {
  selection: Selection;
  /** True while the options needed to validate the selection are still loading. */
  pending: boolean;
  /** Levels whose requested id was not available to the user and was removed. */
  removed: Level[];
}

/** First candidate the user may select, else the first allowed option. */
function pick(allowed: readonly string[], ...candidates: (string | null | undefined)[]) {
  return candidates.find((candidate) => candidate && allowed.includes(candidate)) ?? allowed[0] ?? null;
}

/**
 * Validates a requested selection against what the user may select.
 *
 * - Tenant and Organization are always chosen when any is available:
 *   1. the URL, else the user's last choice (remembered per user);
 *   2. otherwise the backend's default Tenant (first one with an Organization the user
 *      can open; the demo Tenant for superusers without memberships) and its first
 *      Organization.
 *   Site and Network are optional filters ("All" = null).
 * - An id the user cannot select is removed and reported in `removed`.
 * - While a level's options are loading, it and its children are kept as requested and
 *   `pending` is true — nothing is shown until it is validated.
 */
export function resolveSelection(
  requested: Selection,
  options: SelectionOptions,
  defaults: SelectionDefaults,
): Resolution {
  const removed: Level[] = [];
  const result: Selection = { ...EMPTY_SELECTION };

  if (options.tenants === undefined) return { selection: requested, pending: true, removed };
  result.tenant = pick(options.tenants, requested.tenant, defaults.tenant, options.defaultTenant);
  if (requested.tenant && result.tenant !== requested.tenant) removed.push('tenant');
  if (!result.tenant) return { selection: result, pending: false, removed };

  const sameTenant = result.tenant === requested.tenant;
  const wantedOrg = sameTenant ? requested.org : null;
  if (options.organizations === undefined) {
    return { selection: { ...result, org: wantedOrg, site: null, network: null }, pending: true, removed };
  }
  result.org = pick(options.organizations, wantedOrg, defaults.orgByTenant[result.tenant]);
  if (wantedOrg && result.org !== wantedOrg) removed.push('org');
  if (!result.org) return { selection: result, pending: false, removed };

  const sameOrg = sameTenant && result.org === requested.org;
  const wantedSite = sameOrg ? requested.site : null;
  const wantedNetwork = sameOrg ? requested.network : null;
  if (!wantedSite && !wantedNetwork) return { selection: result, pending: false, removed };

  if (wantedSite) {
    if (options.sites === undefined) {
      return { selection: { ...result, site: wantedSite, network: wantedNetwork }, pending: true, removed };
    }
    if (options.sites.includes(wantedSite)) result.site = wantedSite;
    else removed.push('site');
  }

  if (wantedNetwork) {
    if (options.networks === undefined) {
      return { selection: { ...result, network: wantedNetwork }, pending: true, removed };
    }
    const networkSite = options.networks.get(wantedNetwork);
    // A network is only valid inside the selected site (or with no site filter).
    if (networkSite !== undefined && (result.site === null || networkSite === result.site)) {
      result.network = wantedNetwork;
    } else removed.push('network');
  }
  return { selection: result, pending: false, removed };
}
