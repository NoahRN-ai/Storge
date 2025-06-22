import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App'; // The component to test
import { supabase, mockLogin, mockLogout, resetMockSupabase } from './__mocks__/supabaseClient'; // Our mock

// Explicitly mock the supabaseClient
vi.mock('./supabaseClient', async (importOriginal) => {
  const actual = await importOriginal(); // Get actual exports if needed (e.g. for non-mocked parts)
  const mock = await import('./__mocks__/supabaseClient'); // Get our mock
  return {
    ...actual, // Spread actual exports
    supabase: mock.supabase, // Override with our mock Supabase client
    // Keep other actual exports if any, or selectively mock.
    // For this test, we primarily need the mocked supabase client.
  };
});


describe('App Component', () => {
  beforeEach(() => {
    // Reset mocks and any simulated state before each test
    resetMockSupabase();
    // supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    // supabase.from.mockImplementation((tableName) => { /* default mock for 'from' */
    //   if (tableName === 'profiles') {
    //     return {
    //       select: vi.fn().mockReturnThis(),
    //       eq: vi.fn().mockReturnThis(),
    //       single: vi.fn().mockResolvedValue({ data: { id: 'user-123', username: 'TestUser', online_status: false }, error: null }),
    //       update: vi.fn().mockReturnThis(),
    //     };
    //   }
    //   return { /* ... other tables ... */ };
    // });
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore all mocks after each test
  });

  it('renders LoginPage when there is no session', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    render(<App />);
    // Wait for any initial async operations like getSession to complete
    // LoginPage should be visible
    expect(await screen.findByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.queryByText(/Welcome, TestUser!/i)).not.toBeInTheDocument();
  });

  it('renders ChatPage when a session exists and profile is fetched', async () => {
    // Simulate getSession returning a session
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = { user: mockUser, access_token: 'mock-token' };
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: mockSession } });

    // Simulate profile fetch success
    const mockProfileData = { id: 'user-123', username: 'TestUser', online_status: true };
    supabase.from.mockImplementation((tableName) => {
      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col, val) => {
            if (col === 'id' && val === mockUser.id) {
              return {
                single: vi.fn().mockResolvedValueOnce({ data: mockProfileData, error: null }),
              };
            }
            return { single: vi.fn().mockResolvedValueOnce({ data: null, error: {message: "Profile not found"} }) };
          }),
          update: vi.fn().mockReturnThis(), // Mock update chain
        };
      }
      return { /* default mock for other tables */ };
    });

    render(<App />);

    // Wait for "Loading profile..." to disappear and ChatPage content to appear
    await waitFor(() => {
      expect(screen.queryByText(/Loading profile.../i)).not.toBeInTheDocument();
    });

    expect(await screen.findByText(/Welcome, TestUser!/i)).toBeInTheDocument();
    // Check if supabase.from('profiles').update was called to set online_status to true
    await waitFor(() => {
        const profileUpdateCall = supabase.from('profiles').update({ online_status: true, updated_at: expect.any(String) });
        expect(profileUpdateCall.eq).toHaveBeenCalledWith('id', 'user-123');
    });
  });

  it('handles logout correctly', async () => {
    // Start with a logged-in state
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = { user: mockUser, access_token: 'mock-token' };
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: mockSession } });
    const mockProfileData = { id: 'user-123', username: 'TestUser', online_status: true };
     supabase.from.mockImplementation((tableName) => {
      if (tableName === 'profiles') {
        const updateMock = vi.fn().mockReturnThis();
        const eqUpdateMock = vi.fn().mockResolvedValue({ error: null });
        updateMock.eq = eqUpdateMock;

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col, val) => ({
            single: vi.fn().mockResolvedValueOnce({ data: mockProfileData, error: null }),
          })),
          update: updateMock,
        };
      }
      return {};
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText(/Welcome, TestUser!/i)).toBeInTheDocument());

    // Find and click logout button (assuming it's in ChatPage and rendered)
    const logoutButton = await screen.findByRole('button', { name: /logout/i });

    // Simulate auth change callback being ready
    const authCallback = supabase.auth.onAuthStateChange.getMockImplementation()((_event, _session) => {});

    // Click logout
    const user = userEvent.setup();
    await user.click(logoutButton);

    // supabase.auth.signOut should be called
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledTimes(1));

    // Profile online_status should be updated to false
    await waitFor(() => {
      const profileUpdateCall = supabase.from('profiles').update({ online_status: false, updated_at: expect.any(String) });
      expect(profileUpdateCall.eq).toHaveBeenCalledWith('id', 'user-123');
    });

    // Should return to LoginPage
    await waitFor(() => expect(screen.getByPlaceholderText('Email')).toBeInTheDocument());
    expect(screen.queryByText(/Welcome, TestUser!/i)).not.toBeInTheDocument();
  });

  it('displays "Profile not found" scenario gracefully', async () => {
    const mockUser = { id: 'user-404', email: 'notfound@example.com' };
    const mockSession = { user: mockUser, access_token: 'mock-token' };
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: mockSession } });
    supabase.from.mockImplementation((tableName) => {
      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          // Simulate profile not found
          single: vi.fn().mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'Profile not found' } }),
          update: vi.fn().mockReturnThis(), // Mock update chain
        };
      }
      return {};
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading profile.../i)).not.toBeInTheDocument();
    });
    // In App.jsx, if profile is not found (PGRST116), it sets a default-like profile
    expect(await screen.findByText(/Welcome, New User \(loading...\)!/i)).toBeInTheDocument();
  });

});

// Minimal setup for userEvent if not already global
import userEvent from '@testing-library/user-event';

// You might need to add setup for jest-dom matchers if not globally configured in your Vitest setup
// e.g., import '@testing-library/jest-dom';
// Often this is done in a setupTests.js or similar file.
