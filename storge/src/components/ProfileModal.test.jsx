import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ProfileModal from './ProfileModal';
import { supabase, mockUser as defaultMockUser, resetMockSupabase } from '../__mocks__/supabaseClient'; // Using the enhanced mock

// Mock the supabaseClient module itself if not already globally mocked for all tests
vi.mock('../supabaseClient', async () => {
  const mock = await import('../__mocks__/supabaseClient');
  return {
    supabase: mock.supabase,
  };
});

// Direct import for helpers from the mock file
import { supabase as aliasedSupabase, mockUser as defaultMockUser, resetMockSupabase } from '../__mocks__/supabaseClient';


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

  it('renders loading state then displays fetched profile data including existing avatar', async () => {
    const profileWithAvatar = { ...mockFullProfileFromDb, avatar_url: 'https://mock.supabase.co/storage/v1/object/public/avatars/user-123/avatar.png' };
    supabase.from.mockImplementation((tableName) => { // Override for this test
      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: profileWithAvatar, error: null, single: vi.fn().mockResolvedValue({ data: profileWithAvatar, error: null }) }),
          update: vi.fn().mockImplementation((updates) => ({
            eq: vi.fn().mockResolvedValue({ data: { ...profileWithAvatar, ...updates }, error: null }),
            select: vi.fn().mockReturnThis(),
          })),
        };
      }
      return {};
    });

    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);

    expect(await screen.findByLabelText(/Username:/i)).toHaveValue(profileWithAvatar.username);
    expect(screen.getByLabelText(/Bio:/i)).toHaveValue(profileWithAvatar.bio);
    expect(screen.getByLabelText(/Status Message:/i)).toHaveValue(profileWithAvatar.status_message);
    // Check for the existing avatar image
    const avatarImage = screen.getByAltText("Current avatar");
    expect(avatarImage).toBeInTheDocument();
    expect(avatarImage).toHaveAttribute('src', profileWithAvatar.avatar_url);
  });

  it('allows updating profile fields (text only) and submits the form', async () => {
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

  it('allows uploading a new avatar and updates profile with new avatar_url', async () => {
    const user = userEvent.setup();
    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);
    await screen.findByDisplayValue(mockFullProfileFromDb.username); // Ensure form is loaded

    const avatarInput = screen.getByLabelText(/Avatar/i);
    const newAvatarFile = new File(['(⌐□_□)'], 'chucknorris.png', { type: 'image/png' });
    const expectedAvatarPath = `${mockUserProfile.id}/${newAvatarFile.name}`;
    const expectedPublicUrl = `https://mock.supabase.co/storage/v1/object/public/avatars/${expectedAvatarPath}`;

    await user.upload(avatarInput, newAvatarFile);

    // Check if client-side validation passed (no error message for valid file)
    expect(screen.queryByText('Invalid file type.')).not.toBeInTheDocument();
    expect(screen.queryByText('File is too large.')).not.toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /Save Profile/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(supabase.storage.from('avatars').upload).toHaveBeenCalledWith(
        expectedAvatarPath,
        newAvatarFile,
        { cacheControl: '3600', upsert: true }
      );
      expect(supabase.storage.from('avatars').getPublicUrl).toHaveBeenCalledWith(expectedAvatarPath);
    });

    await waitFor(() => {
      const profileUpdateCall = supabase.from('profiles').update(expect.objectContaining({
        avatar_url: expectedPublicUrl,
      }));
      expect(profileUpdateCall.eq).toHaveBeenCalledWith('id', mockUserProfile.id);
      expect(onProfileUpdatedMock).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: expectedPublicUrl }));
    });

    expect(await screen.findByText('Profile updated successfully!')).toBeInTheDocument();
    await waitFor(() => expect(onCloseMock).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('shows error if avatar upload fails', async () => {
    const user = userEvent.setup();
     // Specific mock for storage upload failure for this test
    supabase.storage.from.mockReturnValueOnce({
      upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'Simulated upload error' } }),
      getPublicUrl: vi.fn(), // Won't be called if upload fails
    });

    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);
    await screen.findByDisplayValue(mockFullProfileFromDb.username);

    const avatarInput = screen.getByLabelText(/Avatar/i);
    const newAvatarFile = new File(['(⌐□_□)'], 'avatar_to_fail.png', { type: 'image/png' });
    await user.upload(avatarInput, newAvatarFile);

    const saveButton = screen.getByRole('button', { name: /Save Profile/i });
    await user.click(saveButton);

    expect(await screen.findByText('Failed to upload avatar: Simulated upload error')).toBeInTheDocument();
    expect(supabase.from('profiles').update).not.toHaveBeenCalled(); // Profile text should not update if avatar fails first
    expect(onProfileUpdatedMock).not.toHaveBeenCalled();
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it('shows error for invalid file type', async () => {
    const user = userEvent.setup();
    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);
    await screen.findByDisplayValue(mockFullProfileFromDb.username);

    const avatarInput = screen.getByLabelText(/Avatar/i);
    const invalidFile = new File(['content'], 'document.txt', { type: 'text/plain' });
    await user.upload(avatarInput, invalidFile);

    expect(await screen.findByText('Invalid file type. Please select a PNG, JPEG, or GIF.')).toBeInTheDocument();
  });

  it('shows error for oversized file', async () => {
    const user = userEvent.setup();
    render(<ProfileModal user={mockUserProfile} onClose={onCloseMock} onProfileUpdated={onProfileUpdatedMock} />);
    await screen.findByDisplayValue(mockFullProfileFromDb.username);

    const avatarInput = screen.getByLabelText(/Avatar/i);
    // Create a mock file that's too large (e.g., 3MB, where limit is 2MB)
    const oversizedFile = new File(['a'.repeat(3 * 1024 * 1024)], 'largefile.png', { type: 'image/png' });
    await user.upload(avatarInput, oversizedFile);

    expect(await screen.findByText('File is too large. Maximum size is 2MB.')).toBeInTheDocument();
  });
});
