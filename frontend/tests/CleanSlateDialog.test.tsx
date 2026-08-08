import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CleanSlateDialog } from '@/components/floorplans/CleanSlateDialog';

vi.mock('@/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));

describe('CleanSlateDialog', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    onConfirm.mockResolvedValue(undefined);
  });

  it('identifies the floorplan and requires explicit permanent deletion confirmation', () => {
    render(<CleanSlateDialog isOpen floorplanName="Ground Floor" onClose={onClose} onConfirm={onConfirm} />);

    expect(screen.getByRole('heading', { name: 'Clean Slate' })).toBeInTheDocument();
    expect(screen.getByText(/Ground Floor/)).toBeInTheDocument();
    expect(screen.getByText(/all product placements.*permanently deleted/i)).toBeInTheDocument();
  });

  it('cancels without deleting', async () => {
    render(<CleanSlateDialog isOpen floorplanName="Ground Floor" onClose={onClose} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks submission while pending and closes only after success', async () => {
    let resolve!: () => void;
    onConfirm.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    render(<CleanSlateDialog isOpen floorplanName="Ground Floor" onClose={onClose} onConfirm={onConfirm} />);
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);

    expect(deleteButton).toBeDisabled();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('shows an actionable error and allows retry after failure', async () => {
    onConfirm.mockRejectedValueOnce(new Error('Cleanup unavailable')).mockResolvedValueOnce(undefined);
    render(<CleanSlateDialog isOpen floorplanName="Ground Floor" onClose={onClose} onConfirm={onConfirm} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(await screen.findByText('Cleanup unavailable')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /delete/i });
    expect(retryButton).toBeEnabled();
    await user.click(retryButton);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });
});
