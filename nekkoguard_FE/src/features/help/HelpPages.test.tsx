// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { helpApi, type ReleaseDto } from '@/api/help';
import { renderWith } from '@/features/appearance/testing';
import { ReleasesPage } from './pages/ReleasesPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const release = (version: string, date: string, changes: ReleaseDto['changes'], type: ReleaseDto['type'] = 'stable'): ReleaseDto => ({
  version,
  date,
  type,
  summary: '',
  changes,
});

describe('Release versions', () => {
  it('shows the newest release first and expanded, and hides empty categories', async () => {
    vi.spyOn(helpApi, 'releases').mockResolvedValue({
      current_version: '1.1.0',
      releases: [release('1.1.0', '2027-02-01', { features: ['Dark mode.'] }), release('1.0.0', '2027-01-01', { fixes: ['A fix.'] })],
    });
    renderWith(<ReleasesPage />);
    const latest = await screen.findByRole('article', { name: 'Latest release 1.1.0' });
    expect(within(latest).getByText('Latest')).toBeTruthy();
    expect(within(latest).getByText('Running')).toBeTruthy();
    expect(within(latest).getByText('Dark mode.')).toBeTruthy();
    expect(within(latest).queryByText('Bug fixes')).toBeNull();
    expect(within(latest).queryByText('Security updates')).toBeNull();
  });

  it('older releases expand and collapse', async () => {
    vi.spyOn(helpApi, 'releases').mockResolvedValue({
      current_version: '1.1.0',
      releases: [release('1.1.0', '2027-02-01', { features: ['New.'] }), release('1.0.0', '2027-01-01', { fixes: ['A fix.'] })],
    });
    renderWith(<ReleasesPage />);
    const toggle = await screen.findByRole('button', { name: /v1\.0\.0/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('A fix.')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('A fix.')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText('A fix.')).toBeNull();
  });

  it('pages through many older releases', async () => {
    const many = Array.from({ length: 14 }, (_, i) => release(`1.${14 - i}.0`, `2027-01-${String(15 - i).padStart(2, '0')}`, { fixes: ['x'] }));
    vi.spyOn(helpApi, 'releases').mockResolvedValue({ current_version: '9.9.9', releases: many });
    renderWith(<ReleasesPage />);
    await screen.findByRole('article', { name: 'Latest release 1.14.0' });
    expect(screen.getAllByRole('button', { name: /^v1\./ })).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show older releases' }));
    expect(screen.getAllByRole('button', { name: /^v1\./ })).toHaveLength(13);
  });

  it('explains when nothing has been released', async () => {
    vi.spyOn(helpApi, 'releases').mockResolvedValue({ current_version: '0.1.0', releases: [] });
    renderWith(<ReleasesPage />);
    expect(await screen.findByText('No releases published yet')).toBeTruthy();
  });
});
