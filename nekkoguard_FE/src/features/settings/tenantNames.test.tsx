// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EffectiveAccessDto } from '@/api/tenancy';
import { renderWith, tenancyFor } from '@/features/appearance/testing';
import { MyAccessCard } from './components/MyAccessCard';

afterEach(cleanup);

const access = {
  user: { id: 1, email: 'me@example.test', name: '' },
  via_tenant: true,
  organization_role: null,
  inherited_role: 'operator',
  permissions: ['sites.view'],
  decisions: [{ permission: 'sites.view', allowed: true, source: 'tenant_role' }],
} as unknown as EffectiveAccessDto;

describe('texts name the tenant (a user may belong to several)', () => {
  it('inherited access says which tenant it comes from', () => {
    renderWith(<MyAccessCard access={access} organizationName="Home" />, { tenancy: tenancyFor({ orgPermissions: ['sites.view'] }) });
    expect(screen.getByText('From Acme: Operator')).toBeTruthy();
    expect(screen.getByText('Inherited from Acme')).toBeTruthy();
    expect(screen.queryByText(/from tenant/i)).toBeNull();
  });

  it('administration-only access names the tenant too', () => {
    renderWith(<MyAccessCard access={null} organizationName="Home" />, { tenancy: tenancyFor({}) });
    expect(screen.getByText(/You administer this organization from Acme/)).toBeTruthy();
  });
});
