import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FloorplanFormModal } from '@/components/floorplans/FloorplanFormModal';
import type { Floorplan } from '@/services/floorplan';

describe('FloorplanFormModal', () => {
  const mockFloorplan: Floorplan = {
    id: 1,
    project_id: 1,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
    sort_order: 1,
  };

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders create floorplan modal', async () => {
    render(
      <FloorplanFormModal
        floorplan={null}
        projectId={1}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Create Floorplan');
    });
  });

  it('renders edit floorplan modal with pre-filled data', async () => {
    render(
      <FloorplanFormModal
        floorplan={mockFloorplan}
        projectId={1}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Edit Floorplan');
    });

    // Check if name is pre-filled
    const nameInput = screen.getByLabelText('Floorplan Name *');
    expect(nameInput).toHaveValue('Ground Floor');
  });

  it('shows paste instruction in upload area', async () => {
    render(
      <FloorplanFormModal
        floorplan={null}
        projectId={1}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('Click to upload, drag and drop, or paste (Ctrl+V)');
    });
  });

  it('validates that name is required', async () => {
    render(
      <FloorplanFormModal
        floorplan={null}
        projectId={1}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

      const submitButton = await screen.findByRole('button', { name: /create/i });
    await userEvent.click(submitButton);

    // onSubmit should not be called when validation fails
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('closes modal when cancel clicked', async () => {
    render(
      <FloorplanFormModal
        floorplan={null}
        projectId={1}
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  describe('Paste functionality', () => {
    it('handles image paste from clipboard', async () => {
      await act(async () => {
        render(
          <FloorplanFormModal
            floorplan={null}
            projectId={1}
            isOpen={true}
            onClose={mockOnClose}
            onSubmit={mockOnSubmit}
          />
        );
      });

      // Create a mock image file
      const mockFile = new File(['test-image-content'], 'pasted-image.png', {
        type: 'image/png',
      });

      // Mock clipboard data
      const mockClipboardItem = {
        type: 'image/png',
        getAsFile: vi.fn().mockReturnValue(mockFile),
      };

      const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          items: [mockClipboardItem],
        },
        writable: true,
      });

      // Trigger paste event
      await act(async () => {
        document.dispatchEvent(pasteEvent);
      });

      // Verify the image was processed (preview should appear)
      await waitFor(() => {
        const img = document.querySelector('img[alt="Preview"]');
        expect(img).toBeInTheDocument();
      });
    });

    it('ignores non-image paste content', async () => {
      render(
        <FloorplanFormModal
          floorplan={null}
          projectId={1}
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Mock text clipboard data
      const mockClipboardItem = {
        type: 'text/plain',
        getAsFile: vi.fn().mockReturnValue(null),
      };

      const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          items: [mockClipboardItem],
        },
        writable: true,
      });

      // Trigger paste event
      document.dispatchEvent(pasteEvent);

      // No preview should appear for text paste
      await waitFor(() => {
        const img = document.querySelector('img[alt="Preview"]');
        expect(img).not.toBeInTheDocument();
      });
    });

    it('ignores paste when typing in input field', async () => {
      render(
        <FloorplanFormModal
          floorplan={null}
          projectId={1}
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const nameInput = await screen.findByLabelText('Floorplan Name *');

      // Create a mock image file
      const mockFile = new File(['test-image-content'], 'pasted-image.png', {
        type: 'image/png',
      });

      // Mock clipboard data
      const mockClipboardItem = {
        type: 'image/png',
        getAsFile: vi.fn().mockReturnValue(mockFile),
      };

      const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          items: [mockClipboardItem],
        },
        writable: true,
      });
      Object.defineProperty(pasteEvent, 'target', {
        value: nameInput,
        writable: true,
      });

      // Trigger paste event on input
      nameInput.dispatchEvent(pasteEvent);

      // No preview should appear when pasting into input
      await waitFor(() => {
        const img = document.querySelector('img[alt="Preview"]');
        expect(img).not.toBeInTheDocument();
      });
    });

    it('does not listen for paste when modal is closed', async () => {
      const { rerender } = render(
        <FloorplanFormModal
          floorplan={null}
          projectId={1}
          isOpen={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Create a mock image file
      const mockFile = new File(['test-image-content'], 'pasted-image.png', {
        type: 'image/png',
      });

      // Mock clipboard data
      const mockClipboardItem = {
        type: 'image/png',
        getAsFile: vi.fn().mockReturnValue(mockFile),
      };

      const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          items: [mockClipboardItem],
        },
        writable: true,
      });

      // Trigger paste event while modal is closed
      document.dispatchEvent(pasteEvent);

      // No errors should occur, and no preview should appear
      await waitFor(() => {
        const img = document.querySelector('img[alt="Preview"]');
        expect(img).not.toBeInTheDocument();
      });
    });

    it('shows error for oversized pasted image', async () => {
      await act(async () => {
        render(
          <FloorplanFormModal
            floorplan={null}
            projectId={1}
            isOpen={true}
            onClose={mockOnClose}
            onSubmit={mockOnSubmit}
          />
        );
      });

      // Create a mock oversized image file (> 5MB)
      const largeContent = new Uint8Array(6 * 1024 * 1024); // 6MB
      const mockFile = new File([largeContent], 'large-image.png', {
        type: 'image/png',
      });

      // Mock clipboard data
      const mockClipboardItem = {
        type: 'image/png',
        getAsFile: vi.fn().mockReturnValue(mockFile),
      };

      const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          items: [mockClipboardItem],
        },
        writable: true,
      });

      // Trigger paste event
      await act(async () => {
        document.dispatchEvent(pasteEvent);
      });

      // Should show file size error
      await waitFor(() => {
        expect(document.body.textContent).toContain('File size must be less than 5MB');
      });
    });
  });

  describe('Form submission', () => {
    it('submits form with pasted image', async () => {
      mockOnSubmit.mockResolvedValueOnce(undefined);

      await act(async () => {
        render(
          <FloorplanFormModal
            floorplan={null}
            projectId={1}
            isOpen={true}
            onClose={mockOnClose}
            onSubmit={mockOnSubmit}
          />
        );
      });

      // Enter floorplan name
      const nameInput = await screen.findByLabelText('Floorplan Name *');
      await userEvent.type(nameInput, 'First Floor');

      // Paste an image
      const mockFile = new File(['test-image-content'], 'pasted-image.png', {
        type: 'image/png',
      });

      const mockClipboardItem = {
        type: 'image/png',
        getAsFile: vi.fn().mockReturnValue(mockFile),
      };

      const pasteEvent = new Event('paste', { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          items: [mockClipboardItem],
        },
        writable: true,
      });

      await act(async () => {
        document.dispatchEvent(pasteEvent);
      });

      // Wait for preview to appear
      await waitFor(() => {
        const img = document.querySelector('img[alt="Preview"]');
        expect(img).toBeInTheDocument();
      });

      // Submit the form
    const submitButton = await screen.findByRole('button', { name: /create/i });
      await userEvent.click(submitButton);

      // Verify submission with file
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            project_id: 1,
            name: 'First Floor',
          }),
          expect.any(File)
        );
      });
    });
  });
});
