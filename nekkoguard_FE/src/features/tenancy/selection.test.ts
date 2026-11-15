import { describe, expect, it } from 'vitest';
import {
  changeSelection,
  EMPTY_SELECTION,
  resolveSelection,
  type Selection,
  type SelectionDefaults,
  type SelectionOptions,
} from './selection';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const O1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const O2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const O3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'; // in another tenant
const S1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const S2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const N1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'; // at S1
const N2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'; // at S2

const NO_DEFAULTS: SelectionDefaults = { tenant: null, orgByTenant: {} };

const loaded: SelectionOptions = {
  tenants: [T1, T2],
  organizations: [O1, O2],
  sites: [S1, S2],
  networks: new Map([
    [N1, S1],
    [N2, S2],
  ]),
};

const sel = (partial: Partial<Selection>): Selection => ({ ...EMPTY_SELECTION, ...partial });

describe('changeSelection (dependent resets)', () => {
  const full = sel({ tenant: T1, org: O1, site: S1, network: N1 });

  it('switching tenant resets organization, site and network', () => {
    expect(changeSelection(full, 'tenant', T2)).toEqual(sel({ tenant: T2 }));
  });

  it('switching organization resets site and network', () => {
    expect(changeSelection(full, 'org', O2)).toEqual(sel({ tenant: T1, org: O2 }));
  });

  it('switching site resets network only', () => {
    expect(changeSelection(full, 'site', S2)).toEqual(sel({ tenant: T1, org: O1, site: S2 }));
  });

  it('"All" (null) clears a level and its children', () => {
    expect(changeSelection(full, 'site', null)).toEqual(sel({ tenant: T1, org: O1 }));
  });
});

describe('resolveSelection (validation against backend lists)', () => {
  it('is pending until tenants are loaded, and shows nothing validated', () => {
    const result = resolveSelection(sel({ tenant: T1 }), { ...loaded, tenants: undefined }, NO_DEFAULTS);
    expect(result.pending).toBe(true);
  });

  it('keeps a fully valid selection', () => {
    const requested = sel({ tenant: T1, org: O1, site: S1, network: N1 });
    expect(resolveSelection(requested, loaded, NO_DEFAULTS)).toEqual({
      selection: requested,
      pending: false,
      removed: [],
    });
  });

  it('picks the first tenant and organization when the URL has none', () => {
    expect(resolveSelection(EMPTY_SELECTION, loaded, NO_DEFAULTS).selection).toEqual(sel({ tenant: T1, org: O1 }));
  });

  it('prefers remembered defaults over the first entry', () => {
    const defaults: SelectionDefaults = { tenant: T2, orgByTenant: { [T2]: O2 } };
    expect(resolveSelection(EMPTY_SELECTION, loaded, defaults).selection).toEqual(sel({ tenant: T2, org: O2 }));
  });

  it('ignores remembered defaults the user no longer has', () => {
    const defaults: SelectionDefaults = { tenant: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', orgByTenant: {} };
    expect(resolveSelection(EMPTY_SELECTION, loaded, defaults).selection.tenant).toBe(T1);
  });

  it('removes an unauthorized tenant from a modified URL', () => {
    const forged = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const result = resolveSelection(sel({ tenant: forged, org: O1 }), loaded, NO_DEFAULTS);
    expect(result.selection.tenant).toBe(T1);
    expect(result.removed).toContain('tenant');
  });

  it('removes an organization of another tenant', () => {
    const result = resolveSelection(sel({ tenant: T1, org: O3 }), loaded, NO_DEFAULTS);
    expect(result.selection.org).toBe(O1);
    expect(result.removed).toEqual(['org']);
  });

  it('does not carry an organization over when the tenant was replaced', () => {
    const forged = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const result = resolveSelection(sel({ tenant: forged, org: O2 }), loaded, NO_DEFAULTS);
    expect(result.selection).toEqual(sel({ tenant: T1, org: O1 }));
  });

  it('selects no organization when the user reaches none (no implicit access)', () => {
    const result = resolveSelection(sel({ tenant: T1, org: O1 }), { ...loaded, organizations: [] }, NO_DEFAULTS);
    expect(result.selection).toEqual(sel({ tenant: T1 }));
    expect(result.removed).toEqual(['org']);
  });

  it('selects nothing when the user has no tenant at all', () => {
    const result = resolveSelection(sel({ tenant: T1 }), { ...loaded, tenants: [] }, NO_DEFAULTS);
    expect(result.selection).toEqual(EMPTY_SELECTION);
  });

  it('removes a site the user cannot view (empty options, not pending)', () => {
    const result = resolveSelection(sel({ tenant: T1, org: O1, site: S1 }), { ...loaded, sites: [] }, NO_DEFAULTS);
    expect(result.pending).toBe(false);
    expect(result.selection.site).toBeNull();
    expect(result.removed).toEqual(['site']);
  });

  it('removes a network that is not at the selected site', () => {
    const result = resolveSelection(sel({ tenant: T1, org: O1, site: S1, network: N2 }), loaded, NO_DEFAULTS);
    expect(result.selection).toEqual(sel({ tenant: T1, org: O1, site: S1 }));
    expect(result.removed).toEqual(['network']);
  });

  it('allows a network without a site filter', () => {
    const result = resolveSelection(sel({ tenant: T1, org: O1, network: N2 }), loaded, NO_DEFAULTS);
    expect(result.selection.network).toBe(N2);
  });

  it('waits for sites before validating a requested site', () => {
    const result = resolveSelection(sel({ tenant: T1, org: O1, site: S1 }), { ...loaded, sites: undefined }, NO_DEFAULTS);
    expect(result.pending).toBe(true);
  });

  it('drops site and network when the organization changes', () => {
    const result = resolveSelection(sel({ tenant: T1, org: O3, site: S1, network: N1 }), loaded, NO_DEFAULTS);
    expect(result.selection).toEqual(sel({ tenant: T1, org: O1 }));
  });
});
