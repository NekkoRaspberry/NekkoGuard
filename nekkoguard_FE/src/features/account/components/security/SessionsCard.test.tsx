// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserSessionDto } from '@/api/types';
import { renderWith } from '@/features/appearance/testing';
import { describeDevice } from './sessionDevice';
import { SessionsCard } from './SessionsCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function session(id: number, userAgent: string, extra: Partial<UserSessionDto> = {}): UserSessionDto {
  return { id, user_agent: userAgent, ip: `203.0.113.${id}`, created_at: 1_700_000_000 + id, is_current: false, ...extra };
}

const SESSIONS = [session(1, FIREFOX_WINDOWS, { is_current: true }), session(2, SAFARI_IPHONE), session(3, CHROME_LINUX)];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Fake allauth: GET lists, DELETE ends the given ids. Records the DELETE bodies. */
function fakeServer(initial: UserSessionDto[]) {
  let current = [...initial];
  const deleted: number[][] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        const ids = (JSON.parse(String(init.body)) as { sessions: number[] }).sessions;
        deleted.push(ids);
        current = current.filter((s) => !ids.includes(s.id));
        return json({ status: 200, data: current });
      }
      return json({ status: 200, data: current });
    }),
  );
  return deleted;
}

describe('describeDevice', () => {
  it.each([
    [FIREFOX_WINDOWS, 'Firefox on Windows'],
    [SAFARI_IPHONE, 'Safari on iOS'],
    [CHROME_LINUX, 'Chrome on Linux'],
    ['curl/8.0', 'Unknown device'],
    ['', 'Unknown device'],
  ])('%s → %s', (userAgent, label) => {
    expect(describeDevice(userAgent)).toBe(label);
  });
});

describe('Active sessions', () => {
  it('lists every session, this browser first, without session keys', async () => {
    fakeServer(SESSIONS);
    renderWith(<SessionsCard />);
    const list = await screen.findByRole('list', { name: 'Active sessions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Firefox on Windows');
    expect(rows[0]?.textContent).toContain('This browser');
    expect(rows[0]?.textContent).toContain('203.0.113.1');
    expect(screen.getByText('Safari on iOS')).toBeTruthy();
  });

  it('shows the sign-in time, and "Last active" only when the server tracks it', async () => {
    fakeServer([session(1, FIREFOX_WINDOWS, { is_current: true }), session(2, SAFARI_IPHONE, { last_seen_at: Date.now() / 1000 - 120 })]);
    renderWith(<SessionsCard />);
    const rows = within(await screen.findByRole('list', { name: 'Active sessions' })).getAllByRole('listitem');
    expect(rows[0]?.textContent).toContain('Signed in');
    expect(rows[0]?.textContent).not.toContain('Last active');
    expect(rows[1]?.textContent).toContain('Last active');
  });

  it('signs out one other session after confirmation', async () => {
    const deleted = fakeServer(SESSIONS);
    renderWith(<SessionsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Safari on iOS' }));
    expect(deleted).toEqual([]); // nothing happens before confirming
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out session' }));
    await waitFor(() => expect(deleted).toEqual([[2]]));
    await waitFor(() => expect(screen.queryByText('Safari on iOS')).toBeNull());
  });

  it('signs out all other sessions, keeping this browser', async () => {
    const deleted = fakeServer(SESSIONS);
    renderWith(<SessionsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out all other sessions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out other sessions' }));
    await waitFor(() => expect(deleted.map((ids) => [...ids].sort())).toEqual([[2, 3]]));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Active sessions' })).getAllByRole('listitem')).toHaveLength(1));
    expect((screen.getByRole('button', { name: 'Sign out all other sessions' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an error and refreshes when the session was already gone', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return json({ status: 400, errors: [{ message: 'Select a valid choice.', code: 'invalid_choice', param: 'sessions' }] }, 400);
        }
        calls += 1;
        return json({ status: 200, data: calls === 1 ? SESSIONS : [SESSIONS[0]] });
      }),
    );
    renderWith(<SessionsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Chrome on Linux' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out session' }));
    expect(await screen.findByText('Select a valid choice.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Chrome on Linux')).toBeNull());
  });
});
