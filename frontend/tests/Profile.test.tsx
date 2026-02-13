import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Profile from '../src/pages/Profile';
import { useAuth } from '../src/context/AuthContext';

vi.mock('../src/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('Profile', () => {
  const mockUpdateProfile = vi.fn();
  const mockUser = {
    id: 1,
    email: 'john@example.com',
    full_name: 'John Doe',
    role: 'user',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: mockUser,
      updateProfile: mockUpdateProfile,
    });
  });

  it('renders profile page', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    expect(screen.getByText('Your Profile')).toBeInTheDocument();
    expect(screen.getByText('Manage your account information')).toBeInTheDocument();
  });

  it('displays user information', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('user')).toBeInTheDocument();
  });

  it('displays user avatar with first letter', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('pre-fills form with user data', () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const fullNameInput = screen.getByLabelText('Full Name');
    const emailInput = screen.getByLabelText('Email');

    expect(fullNameInput).toHaveValue('John Doe');
    expect(emailInput).toHaveValue('john@example.com');
  });

  it('updates full name on change', async () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const fullNameInput = screen.getByLabelText('Full Name');
    await userEvent.clear(fullNameInput);
    await userEvent.type(fullNameInput, 'Jane Doe');

    expect(fullNameInput).toHaveValue('Jane Doe');
  });

  it('calls updateProfile with changed data', async () => {
    mockUpdateProfile.mockResolvedValueOnce(undefined);

    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const fullNameInput = screen.getByLabelText('Full Name');
    const submitButton = screen.getByRole('button', { name: /save changes/i });

    await userEvent.clear(fullNameInput);
    await userEvent.type(fullNameInput, 'Jane Doe');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        full_name: 'Jane Doe',
      });
    });
  });

  it('shows success message on update', async () => {
    mockUpdateProfile.mockResolvedValueOnce(undefined);

    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const fullNameInput = screen.getByLabelText('Full Name');
    const submitButton = screen.getByRole('button', { name: /save changes/i });

    await userEvent.clear(fullNameInput);
    await userEvent.type(fullNameInput, 'Jane Doe');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Profile updated successfully')).toBeInTheDocument();
    });
  });

  it('validates password minimum length', async () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const passwordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');
    const submitButton = screen.getByRole('button', { name: /save changes/i });

    await userEvent.type(passwordInput, 'short');
    await userEvent.type(confirmPasswordInput, 'short');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
    });
  });

  it('validates password confirmation match', async () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const passwordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');
    const submitButton = screen.getByRole('button', { name: /save changes/i });

    await userEvent.type(passwordInput, 'password123');
    await userEvent.type(confirmPasswordInput, 'differentpassword');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('shows error when no changes made', async () => {
    render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const submitButton = screen.getByRole('button', { name: /save changes/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('No changes to save')).toBeInTheDocument();
    });
  });
});
