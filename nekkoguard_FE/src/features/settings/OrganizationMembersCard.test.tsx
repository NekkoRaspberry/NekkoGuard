// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tenancyApi, type OrganizationInvitationDto, type OrganizationMembershipDto } from '@/api/tenancy';
import { ORG_ID, renderWith, TENANT_ID } from '@/features/appearance/testing';
import { OrganizationMembersCard } from './components/OrganizationMembersCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const member = (id: number, email: string, role: OrganizationMembershipDto['role']): OrganizationMembershipDto => ({
  id,
  user: { id: id + 100, email, name: '' },
  role,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const invitation = (email: string, status: OrganizationInvitationDto['status'] = 'pending'): OrganizationInvitationDto => ({
  id: `inv-${email}`,
  email,
  role: 'viewer',
  status,
  invited_by: { id: 1, email: 'me@example.test', name: 'Me' },
  expires_at: '2026-12-01T00:00:00Z',
  last_sent_at: '2026-11-24T00:00:00Z',
  accepted_at: null,
  created_at: '2026-11-24T00:00:00Z',
});

function setup({ invitations = [] as OrganizationInvitationDto[], canManage = true } = {}) {
  vi.spyOn(tenancyApi, 'listOrganizationMembers').mockResolvedValue([
    member(1, 'zoe@example.test', 'operator'),
    member(2, 'adam@example.test', 'admin'),
  ]);
  vi.spyOn(tenancyApi, 'listInvitations').mockResolvedValue(invitations);
  renderWith(<OrganizationMembersCard scope={{ tenantId: TENANT_ID, orgId: ORG_ID }} canManage={canManage} />);
}

const openAddDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add member' }));
  return screen.getByRole('dialog');
};

describe('Add member (email only)', () => {
  it('asks only for an email address and explains the default role', async () => {
    setup();
    const dialog = await openAddDialog();
    expect(within(dialog).getByLabelText('Email address')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Organization role')).toBeNull();
    expect(within(dialog).getByText(/Viewer role/)).toBeTruthy();
  });

  it('adds an existing account and says so', async () => {
    setup();
    const add = vi.spyOn(tenancyApi, 'addOrganizationMember').mockResolvedValue({
      result: 'added',
      membership: member(3, 'bob@example.test', 'viewer'),
    });
    const dialog = await openAddDialog();
    fireEvent.change(within(dialog).getByLabelText('Email address'), { target: { value: ' bob@example.test ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith(TENANT_ID, ORG_ID, { email: 'bob@example.test' }));
    expect(await screen.findByText('bob@example.test added')).toBeTruthy();
  });

  it('invites an unknown address and says an email was sent', async () => {
    setup();
    vi.spyOn(tenancyApi, 'addOrganizationMember').mockResolvedValue({ result: 'invited', invitation: invitation('new@corp.example') });
    const dialog = await openAddDialog();
    fireEvent.change(within(dialog).getByLabelText('Email address'), { target: { value: 'new@corp.example' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add member' }));
    expect(await screen.findByText('Invitation sent')).toBeTruthy();
  });
});

describe('Invitations', () => {
  it('is hidden when there are no open invitations', async () => {
    setup();
    await screen.findByText('zoe@example.test');
    expect(screen.queryByRole('table', { name: 'Invitations' })).toBeNull();
  });

  it('lists pending and expired invitations with resend and revoke', async () => {
    setup({ invitations: [invitation('a@corp.example'), invitation('b@corp.example', 'expired')] });
    const table = await screen.findByRole('table', { name: 'Invitations' });
    expect(within(table).getByText('Pending')).toBeTruthy();
    expect(within(table).getByText('Expired')).toBeTruthy();

    const resend = vi.spyOn(tenancyApi, 'resendInvitation').mockResolvedValue(invitation('b@corp.example'));
    fireEvent.click(screen.getByRole('button', { name: 'Resend the invitation to b@corp.example' }));
    await waitFor(() => expect(resend).toHaveBeenCalledWith(TENANT_ID, ORG_ID, 'inv-b@corp.example'));

    const revoke = vi.spyOn(tenancyApi, 'revokeInvitation').mockResolvedValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke the invitation to a@corp.example' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(TENANT_ID, ORG_ID, 'inv-a@corp.example'));
  });

  it('member roles sort by rank, not alphabetically', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Direct members' });
    fireEvent.click(within(table).getByRole('button', { name: /Role/ }));
    const first = within(table).getAllByRole('row')[1] as HTMLElement;
    expect(within(first).getByText('adam@example.test')).toBeTruthy(); // administrator before operator (alphabetically: Operator first)
  });
});

describe('Read-only (members.view without members.manage)', () => {
  it('lists members and invitations with Export but no actions', async () => {
    setup({ invitations: [invitation('new@corp.example')], canManage: false });
    expect(await screen.findByText('zoe@example.test')).toBeTruthy();
    expect(await screen.findByText('new@corp.example')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add member' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Resend / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revoke / })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Export/ }).length).toBeGreaterThan(0);
  });
});
