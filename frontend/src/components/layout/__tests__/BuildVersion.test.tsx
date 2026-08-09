import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuildVersion } from '../BuildVersion';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}));

describe('BuildVersion', () => {
  it('shows the full immutable build SHA returned by /version', async () => {
    const api = (await import('@/services/api')).default;
    vi.mocked(api.get).mockResolvedValue({
      data: {
        sha: '0123456789abcdef0123456789abcdef01234567',
        built_at: '2026-08-09T12:00:00Z',
      },
    });

    render(<BuildVersion />);

    expect(await screen.findByText('0123456789abcdef0123456789abcdef01234567'))
      .toBeInTheDocument();
  });
});
