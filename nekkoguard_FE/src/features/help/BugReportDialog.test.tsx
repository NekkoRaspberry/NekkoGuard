// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { helpApi, type BugReportInput } from '@/api/help';
import { ApiError } from '@/api/errors';
import { fakeTenancy, organizationDto, renderWith, tenantDto } from '@/features/appearance/testing';
import { describeBrowser, describeOs } from './browserContext';
import { validateAttachment } from './bugReport';
import { BugReportDialog } from './components/BugReportDialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const onClose = vi.fn();
  const tenant = tenantDto(['tenant.view']);
  const organization = organizationDto(['sites.view']);
  renderWith(<BugReportDialog onClose={onClose} />, {
    route: '/settings/organization/members?tab=1',
    tenancy: fakeTenancy({ currentTenant: tenant, currentOrganization: organization }),
  });
  return { onClose, tenant, organization };
}

const dialog = () => screen.getByRole('dialog');

function fillRequired() {
  fireEvent.change(within(dialog()).getByLabelText('Title'), { target: { value: '  Export does nothing ' } });
  fireEvent.change(within(dialog()).getByLabelText('Description'), { target: { value: 'No file is downloaded.' } });
}

const review = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Review report' }));
const send = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Send report' }));

describe('Report a bug', () => {
  it('requires only a title and a description', () => {
    setup();
    review();
    expect(within(dialog()).getByText('Give the problem a short title.')).toBeTruthy();
    expect(within(dialog()).getByText('Describe what went wrong.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Report a bug' })).toBeTruthy();
  });

  it('keeps optional details out of the way until asked for', () => {
    setup();
    expect(within(dialog()).queryByLabelText('Steps to reproduce')).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'More details (optional)' }));
    expect(within(dialog()).getByLabelText('Steps to reproduce')).toBeTruthy();
  });

  it('shows the report and the automatically included context before sending', () => {
    const { tenant, organization } = setup();
    fillRequired();
    review();
    const reviewDialog = screen.getByRole('dialog', { name: 'Review your report' });
    expect(within(reviewDialog).getByText('Export does nothing')).toBeTruthy();
    expect(within(reviewDialog).getByText('Included automatically')).toBeTruthy();
    expect(within(reviewDialog).getByText(tenant.name)).toBeTruthy();
    expect(within(reviewDialog).getByText(organization.name)).toBeTruthy();
    // Route path only: never the query string.
    expect(within(reviewDialog).getByText('/settings/organization/members')).toBeTruthy();
  });

  it('sends the report once with server-validated context hints and says it was emailed', async () => {
    const { tenant, organization } = setup();
    const submit = vi
      .spyOn(helpApi, 'submitBugReport')
      .mockResolvedValue({ id: 'abcdef12-0000-4000-8000-000000000000', email_status: 'sent', created_at: '2026-11-15T00:00:00Z' });
    fillRequired();
    review();
    send();
    send(); // a double click must not send twice
    expect(await screen.findByText('Thank you — your report was sent')).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    const input = submit.mock.calls[0]?.[0] as BugReportInput;
    expect(input.title).toBe('Export does nothing');
    expect(input.tenant).toBe(tenant.id);
    expect(input.organization).toBe(organization.id);
    expect(input.context.page).toBe('/settings/organization/members');
    expect(input.client_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a retry after a failure reuses the same draft token', async () => {
    setup();
    const submit = vi
      .spyOn(helpApi, 'submitBugReport')
      .mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'Cannot reach the NekkoGuard server.' }))
      .mockResolvedValueOnce({ id: 'abcdef12-0000-4000-8000-000000000000', email_status: 'sent', created_at: '2026-11-15T00:00:00Z' });
    fillRequired();
    review();
    send();
    expect(await screen.findByText('Cannot reach the NekkoGuard server.')).toBeTruthy();
    expect(screen.queryByText('Thank you — your report was sent')).toBeNull();
    send();
    await screen.findByText('Thank you — your report was sent');
    const [first, second] = submit.mock.calls.map((call) => call[0].client_token);
    expect(second).toBe(first);
  });

  it('says clearly when the report was saved but not emailed', async () => {
    setup();
    vi.spyOn(helpApi, 'submitBugReport').mockResolvedValue({
      id: 'abcdef12-0000-4000-8000-000000000000',
      email_status: 'failed',
      created_at: '2026-11-15T00:00:00Z',
    });
    fillRequired();
    review();
    send();
    expect(await screen.findByText('Your report was saved, but not emailed')).toBeTruthy();
  });

  it('returns to the form with the field error the server reported', async () => {
    setup();
    vi.spyOn(helpApi, 'submitBugReport').mockRejectedValue(
      new ApiError({ kind: 'http', status: 400, message: 'Invalid input.', fieldErrors: { title: ['Ensure this field has no more than 150 characters.'] } }),
    );
    fillRequired();
    review();
    send();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Report a bug' })).toBeTruthy());
    expect(screen.getByText('Ensure this field has no more than 150 characters.')).toBeTruthy();
  });
});

describe('screenshot and browser details', () => {
  it('accepts only small PNG, JPEG or WebP images', () => {
    expect(validateAttachment(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull();
    expect(validateAttachment(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }))).toMatch(/PNG, JPEG or WebP/);
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    expect(validateAttachment(big)).toMatch(/2 MB/);
  });

  it('describes the browser and OS without sending the raw user agent', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
    expect(describeBrowser(ua)).toBe('Chrome 141');
    expect(describeOs(ua)).toBe('Linux');
    expect(describeBrowser('Mozilla/5.0 (Windows NT 10.0; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe('Firefox 140');
  });
});
