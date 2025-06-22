import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LoginPage from './LoginPage';
import { supabase, resetMockSupabase, mockUser } from '../__mocks__/supabaseClient';

// Mock the supabaseClient module
vi.mock('../supabaseClient', async (importOriginal) => {
  const actual = await importOriginal();
  const mock = await import('../__mocks__/supabaseClient');
  return {
    ...actual,
    supabase: mock.supabase,
    mockUser: mock.mockUser, // Make mockUser available if needed directly in tests
    resetMockSupabase: mock.resetMockSupabase,
  };
});

describe('LoginPage Component', () => {
  beforeEach(() => {
    resetMockSupabase(); // Resets Supabase mock state and clears mocks
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sign-in form by default', () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Need an account? Sign Up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forgot Password?' })).toBeInTheDocument();
  });

  it('allows typing into email and password fields', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const emailInput = screen.getByPlaceholderText('Email');
    const passwordInput = screen.getByPlaceholderText('Password');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('password123');
  });

  it('handles successful sign-in', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Email'), mockUser.email);
    await user.type(screen.getByPlaceholderText('Password'), 'correctpassword');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: mockUser.email,
        password: 'correctpassword',
      });
    });
    // App.jsx's onAuthStateChange handles UI transition, LoginPage itself doesn't navigate
    // We mainly check if the call was made. No error message should be shown.
    expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
  });

  it('shows error message on sign-in failure', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Error: Invalid login credentials')).toBeInTheDocument();
  });

  it('switches to sign-up mode and handles successful sign-up', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Need an account? Sign Up' }));
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Email'), 'new@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'newpassword123');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'newpassword123',
      });
    });
    expect(await screen.findByText(/Sign up successful!/i)).toBeInTheDocument();
  });

  it('shows error message on sign-up failure (user exists)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Need an account? Sign Up' }));
    await user.type(screen.getByPlaceholderText('Email'), 'exists@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Error: User already registered')).toBeInTheDocument();
  });

  it('switches to password recovery mode and handles request', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Forgot Password?' }));
    expect(screen.getByRole('button', { name: 'Recover Password' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Email'), 'exists@example.com');
    await user.click(screen.getByRole('button', { name: 'Recover Password' }));

    await waitFor(() => {
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('exists@example.com', {
        redirectTo: window.location.origin + '/',
      });
    });
    expect(await screen.findByText(/If an account exists for this email, a password recovery link has been sent./i)).toBeInTheDocument();
  });

   it('shows error if password recovery email is not found', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Forgot Password?' }));

    await user.type(screen.getByPlaceholderText('Email'), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: 'Recover Password' }));

    await waitFor(() => {
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Error: User not found or error sending email')).toBeInTheDocument();
  });

  it('disables button when fields are empty (sign-in mode)', () => {
    render(<LoginPage />);
    const signInButton = screen.getByRole('button', { name: 'Sign In' });
    expect(signInButton).toBeDisabled();
  });

  it('enables button when fields are filled (sign-in mode)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const signInButton = screen.getByRole('button', { name: 'Sign In' });
    expect(signInButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'password');
    expect(signInButton).not.toBeDisabled();
  });

  it('disables button when email is empty (recover password mode)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Forgot Password?' }));

    const recoverButton = screen.getByRole('button', { name: 'Recover Password' });
    expect(recoverButton).toBeDisabled();
  });

  it('enables button when email is filled (recover password mode)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Forgot Password?' }));

    const recoverButton = screen.getByRole('button', { name: 'Recover Password' });
    expect(recoverButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    expect(recoverButton).not.toBeDisabled();
  });

});
