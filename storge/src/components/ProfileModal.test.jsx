import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ProfileModal from './ProfileModal';
import { supabase, mockUser as defaultMockUser, resetMockSupabase } from '../__mocks__/supabaseClient'; // Using the enhanced mock

// Mock the supabaseClient module itself if not already globally mocked for all tests
vi.mock('../supabaseClient', async (importOriginal) => {
  const actual = await importOriginal();
  const mock = await import('../__mocks__/supabaseClient');
  return {
    ...actual,
    supabase: mock.supabase,
    mockUser: mock.mockUser, // if you export it from mock
    // any other specific exports from the mock if needed
  };
});

describe('ProfileModal Component', () => {
  const mockUserProfile = { // This is the user prop passed to ProfileModal
    id: defaultMockUser.id, // 'user-123'
    username: 'InitialUsername', // Different from mock DB to test fetching
  };

  const mockFullProfileFromDb = { // This is what the modal's internal fetch should get
    id: defaultMockUser.id,
    username: 'DBUsername',
    bio: 'My current bio',
    status_message: 'Feeling great',
  };

  let onCloseMock;
  let onProfileUpdatedMock;

  beforeEach(() => {
    resetMockSupabase(); // Resets the mock DB stores and function call histories
    onCloseMock = vi.fn();
    onProfileUpdatedMock = vi.fn();

    // Setup the mock for supabase.from('profiles').select().eq().single() for THIS component's fetch
    // This will be called by the useEffect in ProfileModal
    supabase.from.mockImplementation((tableName) => {
      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col, userId) => {
            if (col === 'id' && userId === mockUserProfile.id) {
              // Simulate fetching the full profile for the modal
              return {
                single: vi.fn().mockResolvedValue({ data: mockFullProfileFromDb, error: null }),
              };
            }
            return { // Fallback for other IDs if any
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Profile not found in specific mock' } }),
            };
          }),
          update: vi.fn().mockImplementation((updates) => ({ // Mock for the update operation
            eq: vi.fn((col, userId) => {
              if (col === 'id' && userId === mockUserProfile.id) {
                // Simulate successful update and return the updated data
                const updatedData = { ...mockFullProfileFromDb, ...updates };
                return Promise.resolve({ data: updatedData, error: null });
              }
              return Promise.resolve({ data: null, error: { message: 'Update failed, user not found' }});
            }),
            select: vi.fn().mockReturnThis(), // if .select() is chained after update
          })),
        };
      }
      return { /* default empty mock for other tables if needed by other logic */ };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state then displays fetched profile data', async () => {
    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);

    // Initially, it might show a loading state or use initial prop values before fetch completes
    // Depending on implementation, direct check or wait for specific elements

    expect(await screen.findByLabelText(/Username:/i)).toHaveValue(mockFullProfileFromDb.username);
    expect(screen.getByLabelText(/Bio:/i)).toHaveValue(mockFullProfileFromDb.bio);
    expect(screen.getByLabelText(/Status Message:/i)).toHaveValue(mockFullProfileFromDb.status_message);
  });

  it('allows updating profile fields and submits the form', async () => {
    const user = userEvent.setup();
    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);

    await screen.findByDisplayValue(mockFullProfileFromDb.username); // Ensure form is loaded

    const usernameInput = screen.getByLabelText(/Username:/i);
    const bioTextarea = screen.getByLabelText(/Bio:/i);
    const statusInput = screen.getByLabelText(/Status Message:/i);
    const saveButton = screen.getByRole('button', { name: /Save Profile/i });

    await user.clear(usernameInput);
    await user.type(usernameInput, 'NewUsername');
    await user.clear(bioTextarea);
    await user.type(bioTextarea, 'This is my new bio.');
    await user.clear(statusInput);
    await user.type(statusInput, 'Feeling updated!');

    await user.click(saveButton);

    await waitFor(() => {
      // Check if supabase.from('profiles').update was called correctly
      const updateCall = supabase.from('profiles').update(expect.objectContaining({
        username: 'NewUsername',
        bio: 'This is my new bio.',
        status_message: 'Feeling updated!',
      }));
      // This chained call needs to be asserted if the mock is structured this way
      expect(updateCall.eq).toHaveBeenCalledWith('id', mockUserProfile.id);
    });

    // Check if onProfileUpdated was called with the new data
    await waitFor(() => {
      expect(onProfileUpdatedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'NewUsername',
          bio: 'This is my new bio.',
          status_message: 'Feeling updated!',
        })
      );
    });

    // Success message and modal close (modal has a setTimeout before close)
    expect(await screen.findByText('Profile updated successfully!')).toBeInTheDocument();
    await waitFor(() => expect(onCloseMock).toHaveBeenCalled(), { timeout: 3000 }); // Wait for timeout in modal
  });

  it('calls onClose when Close button is clicked', async () => {
    const user = userEvent.setup();
    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);
    await screen.findByDisplayValue(mockFullProfileFromDb.username); // Ensure form is loaded

    const closeButton = screen.getByRole('button', { name: /Close/i });
    await user.click(closeButton);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('displays an error message if fetching profile fails', async () => {
    // Override the mock for this specific test to simulate fetch failure
    supabase.from.mockImplementation((tableName) => {
      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Simulated fetch error' } }),
        };
      }
      return {};
    });

    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);
    expect(await screen.findByText('Failed to load profile data.')).toBeInTheDocument();
    // Check if username input falls back to the initial prop if fetch fails
    expect(screen.getByLabelText(/Username:/i)).toHaveValue(mockUserProfile.username);
  });

  it('displays an error message if updating profile fails', async () => {
    const user = userEvent.setup();
    // Override update mock for failure
     supabase.from.mockImplementation((tableName) => {
      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(), // For initial load
          eq: vi.fn((col, userId) => ({
            single: vi.fn().mockResolvedValue({ data: mockFullProfileFromDb, error: null }), // Initial load success
          })),
          update: vi.fn().mockImplementation((updates) => ({ // Mock for the update operation
            eq: vi.fn((col, userId) => Promise.resolve({ data: null, error: { message: 'Simulated update error' }})),
            select: vi.fn().mockReturnThis(),
          })),
        };
      }
      return {};
    });


    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);
    await screen.findByDisplayValue(mockFullProfileFromDb.username);

    const saveButton = screen.getByRole('button', { name: /Save Profile/i });
    await user.click(saveButton);

    expect(await screen.findByText(/Failed to update profile: Simulated update error/i)).toBeInTheDocument();
    expect(onProfileUpdatedMock).not.toHaveBeenCalled();
    expect(onCloseMock).not.toHaveBeenCalled(); // Should not close on error
  });
});
