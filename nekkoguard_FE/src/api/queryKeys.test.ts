import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';

const T1 = 't1';
const T2 = 't2';
const O1 = 'o1';
const O2 = 'o2';

/** TanStack Query prefix matching (what removeQueries / invalidateQueries use). */
const startsWith = (key: readonly unknown[], prefix: readonly unknown[]) =>
  prefix.every((part, index) => key[index] === part);

const organizationKeys = (t: string, o: string) => [
  queryKeys.organization(t, o),
  queryKeys.organizationMembers(t, o),
  queryKeys.overrides(t, o),
  queryKeys.accessList(t, o),
  queryKeys.sites(t, o),
  queryKeys.networks(t, o, null),
  queryKeys.networks(t, o, 'site-1'),
  queryKeys.organizationActivity(t, o, 1),
];

describe('query cache isolation', () => {
  it('every organization key contains both the tenant and the organization', () => {
    for (const key of organizationKeys(T1, O1)) {
      expect(key).toContain(T1);
      expect(key).toContain(O1);
    }
  });

  it('keys of different organizations or tenants never collide', () => {
    const a = organizationKeys(T1, O1).map((k) => JSON.stringify(k));
    const b = organizationKeys(T1, O2).map((k) => JSON.stringify(k));
    const c = organizationKeys(T2, O1).map((k) => JSON.stringify(k));
    expect(a.filter((k) => b.includes(k) || c.includes(k))).toEqual([]);
  });

  it('dropping an organization scope covers all its data and nothing else', () => {
    const scope = queryKeys.organizationScope(T1, O1);
    expect(organizationKeys(T1, O1).every((key) => startsWith(key, scope))).toBe(true);
    expect(organizationKeys(T1, O2).some((key) => startsWith(key, scope))).toBe(false);
  });

  it('dropping a tenant scope covers its organizations and members, not other tenants', () => {
    const scope = queryKeys.tenantScope(T1);
    const tenantKeys = [
      ...organizationKeys(T1, O1),
      queryKeys.tenantMembers(T1),
      queryKeys.organizations(T1),
      queryKeys.tenantActivity(T1, 2),
    ];
    expect(tenantKeys.every((key) => startsWith(key, scope))).toBe(true);
    expect(organizationKeys(T2, O1).some((key) => startsWith(key, scope))).toBe(false);
  });

  it('the tenant list is not inside any tenant scope', () => {
    expect(startsWith(queryKeys.tenants, queryKeys.tenantScope(T1))).toBe(false);
  });

  it('networks filtered by site and unfiltered are separate entries', () => {
    expect(queryKeys.networks(T1, O1, null)).not.toEqual(queryKeys.networks(T1, O1, 'site-1'));
  });
});
