// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, resolveSelection, type SelectionDefaults, type SelectionOptions } from './selection';
import { readDefaults, rememberSelection } from './storage';

/**
 * Where the app opens:
 *   1. the last Tenant/Organization this user chose;
 *   2. otherwise the backend's default Tenant (first with an Organization the user can
 *      open) and its first Organization;
 *   3. superusers without memberships: the demo Tenant (also marked by the backend).
 */
const T1 = '11111111-1111-4111-8111-111111111111';
const T_DEMO = '22222222-2222-4222-8222-222222222222';
const O1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const O2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const NOTHING: SelectionDefaults = { tenant: null, orgByTenant: {} };

const options = (overrides: Partial<SelectionOptions> = {}): SelectionOptions => ({
  tenants: [T1, T_DEMO],
  organizations: [O1, O2],
  sites: [],
  networks: new Map(),
  ...overrides,
});
const open = (defaults: SelectionDefaults, opts = options()) => resolveSelection(EMPTY_SELECTION, opts, defaults).selection;

beforeEach(() => window.localStorage.clear());

describe('rule 1: reopen the last organization', () => {
  it('reopens the remembered tenant and organization', () => {
    rememberSelection({ ...EMPTY_SELECTION, tenant: T1, org: O2 }, 7);
    expect(open(readDefaults(7), options({ defaultTenant: T_DEMO }))).toMatchObject({ tenant: T1, org: O2 });
  });

  it('is remembered per user: another user of the browser is not affected', () => {
    rememberSelection({ ...EMPTY_SELECTION, tenant: T1, org: O2 }, 7);
    expect(readDefaults(8)).toEqual(NOTHING);
    expect(open(readDefaults(8), options({ defaultTenant: T_DEMO })).tenant).toBe(T_DEMO);
  });

  it('a remembered organization the user lost falls back to the first one', () => {
    rememberSelection({ ...EMPTY_SELECTION, tenant: T1, org: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9' }, 7);
    expect(open(readDefaults(7))).toMatchObject({ tenant: T1, org: O1 });
  });

  it('remembers nothing while the user is unknown', () => {
    rememberSelection({ ...EMPTY_SELECTION, tenant: T1, org: O1 }, null);
    expect(window.localStorage.length).toBe(0);
    expect(readDefaults(null)).toEqual(NOTHING);
  });

  it('drops the old browser-wide keys', () => {
    window.localStorage.setItem('nekkoguard.context.tenant', T1);
    rememberSelection({ ...EMPTY_SELECTION, tenant: T1, org: O1 }, 7);
    expect(window.localStorage.getItem('nekkoguard.context.tenant')).toBeNull();
  });
});

describe('rules 2 and 3: nothing remembered', () => {
  it('opens the backend default tenant and its first organization', () => {
    expect(open(NOTHING, options({ defaultTenant: T_DEMO }))).toMatchObject({ tenant: T_DEMO, org: O1 });
  });

  it('without a default, opens the first tenant', () => {
    expect(open(NOTHING).tenant).toBe(T1);
  });

  it('ignores a default the user cannot select', () => {
    expect(open(NOTHING, options({ defaultTenant: '33333333-3333-4333-8333-333333333333' })).tenant).toBe(T1);
  });

  it('the URL still wins over everything', () => {
    const requested = { ...EMPTY_SELECTION, tenant: T1, org: O2 };
    const defaults: SelectionDefaults = { tenant: T_DEMO, orgByTenant: {} };
    expect(resolveSelection(requested, options({ defaultTenant: T_DEMO }), defaults).selection).toMatchObject({ tenant: T1, org: O2 });
  });
});
