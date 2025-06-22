import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RoomList from './RoomList'; // Adjust path as necessary
import { supabase, mockUser as defaultMockUser, resetMockSupabase } from '../__mocks__/supabaseClient';

// Mock the supabaseClient module
vi.mock('../supabaseClient', async () => {
  const mock = await import('../__mocks__/supabaseClient');
  return { supabase: mock.supabase };
});

// Direct import for helpers
import { supabase as aliasedSupabase, mockUser as defaultMockUser, resetMockSupabase } from '../__mocks__/supabaseClient';

const mockRoomsData = [
  { id: 'room1', name: 'General Chat', type: 'group', updated_at: new Date().toISOString() },
  { id: 'room2', name: 'Dev Team', type: 'group', updated_at: new Date().toISOString() },
  { id: 'room3', name: 'DM with UserX', type: 'direct', updated_at: new Date().toISOString() }, // Placeholder for DM name
];

describe('RoomList Component (including CreateGroupRoomModal)', () => {
  let onSelectRoomMock;
  let onCreateRoomMock; // This is actually onRefreshRoomsNeeded

  beforeEach(() => {
    resetMockSupabase();
    onSelectRoomMock = vi.fn();
    onCreateRoomMock = vi.fn(); // Renamed to onRefreshRooms for clarity in App.jsx

    // Mock for supabase.from('rooms').insert() for CreateGroupRoomModal
    // The mock supabaseClient already handles simulating the trigger for adding creator to participants
    supabase.from.mockImplementation((tableName) => {
      if (tableName === 'rooms') {
        return {
          insert: vi.fn().mockImplementation(async (roomData) => {
            const newRoomId = `new-room-${Math.random().toString(36).substr(2, 5)}`;
            const createdRoom = {
              ...roomData,
              id: newRoomId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            // Simulate adding to mock DB (already handled by global mock, but good for clarity)
            // mockRoomsDb[newRoomId] = createdRoom;
            // if (roomData.created_by) {
            //   mockRoomParticipantsDb.push({ room_id: newRoomId, profile_id: roomData.created_by, joined_at: new Date().toISOString() });
            // }
            return { data: createdRoom, error: null, select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({data: createdRoom, error: null}) };
          }),
          // Add other methods if RoomList itself fetches rooms (it doesn't, it receives as prop)
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { /* default */ };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a list of rooms and "No conversations yet" if rooms array is empty', () => {
    render(
      <RoomList
        rooms={[]}
        currentRoomId={null}
        onSelectRoom={onSelectRoomMock}
        onCreateRoom={onCreateRoomMock}
        currentUserId={defaultMockUser.id}
      />
    );
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Group' })).toBeInTheDocument();
  });

  it('renders rooms correctly and highlights the active room', () => {
    render(
      <RoomList
        rooms={mockRoomsData}
        currentRoomId="room2"
        onSelectRoom={onSelectRoomMock}
        onCreateRoom={onCreateRoomMock}
        currentUserId={defaultMockUser.id}
      />
    );
    expect(screen.getByText('General Chat')).toBeInTheDocument();
    const devTeamRoomItem = screen.getByText('Dev Team');
    expect(devTeamRoomItem).toBeInTheDocument();
    expect(devTeamRoomItem).toHaveClass('active'); // Assuming 'active' class for current room
    expect(screen.getByText(`Chat ${mockRoomsData[2].id.substring(0,4)}`)).toBeInTheDocument(); // DM name placeholder
  });

  it('calls onSelectRoom when a room item is clicked', async () => {
    const user = userEvent.setup();
    render(
      <RoomList
        rooms={mockRoomsData}
        currentRoomId="room1"
        onSelectRoom={onSelectRoomMock}
        onCreateRoom={onCreateRoomMock}
        currentUserId={defaultMockUser.id}
      />
    );
    const roomToSelect = screen.getByText('Dev Team');
    await user.click(roomToSelect);
    expect(onSelectRoomMock).toHaveBeenCalledWith('room2');
  });

  describe('CreateGroupRoomModal', () => {
    it('opens the modal when "+ Group" button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <RoomList
          rooms={mockRoomsData}
          currentRoomId="room1"
          onSelectRoom={onSelectRoomMock}
          onCreateRoom={onCreateRoomMock}
          currentUserId={defaultMockUser.id}
        />
      );
      const newGroupButton = screen.getByRole('button', { name: '+ Group' });
      await user.click(newGroupButton);
      expect(await screen.findByText('Create New Group')).toBeInTheDocument();
      expect(screen.getByLabelText('Group Name:')).toBeInTheDocument();
    });

    it('allows creating a new group room and calls relevant callbacks', async () => {
      const user = userEvent.setup();
      render(
        <RoomList
          rooms={[]}
          currentRoomId={null}
          onSelectRoom={onSelectRoomMock}
          onCreateRoom={onCreateRoomMock}
          currentUserId={defaultMockUser.id}
        />
      );

      await user.click(screen.getByRole('button', { name: '+ Group' }));

      const roomNameInput = await screen.findByLabelText('Group Name:');
      const createButton = screen.getByRole('button', { name: 'Create Group' });

      await user.type(roomNameInput, 'Test New Group');
      await user.click(createButton);

      await waitFor(() => {
        expect(supabase.from('rooms').insert).toHaveBeenCalledWith({
          name: 'Test New Group',
          type: 'group',
          created_by: defaultMockUser.id,
        });
      });

      await waitFor(() => {
        expect(onCreateRoomMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test New Group' }));
      });

      // Modal should close
      expect(screen.queryByText('Create New Group')).not.toBeInTheDocument();
    });

    it('shows an error in modal if room name is empty', async () => {
      const user = userEvent.setup();
      render(
        <RoomList
          rooms={[]}
          currentRoomId={null}
          onSelectRoom={onSelectRoomMock}
          onCreateRoom={onCreateRoomMock}
          currentUserId={defaultMockUser.id}
        />
      );
      await user.click(screen.getByRole('button', { name: '+ Group' }));

      const createButton = await screen.findByRole('button', { name: 'Create Group' });
      await user.click(createButton); // Click with empty name

      expect(await screen.findByText('Room name cannot be empty.')).toBeInTheDocument();
      expect(supabase.from('rooms').insert).not.toHaveBeenCalled();
      expect(onCreateRoomMock).not.toHaveBeenCalled();
    });

    it('modal closes when cancel button is clicked', async () => {
      const user = userEvent.setup();
       render(
        <RoomList
          rooms={[]}
          currentRoomId={null}
          onSelectRoom={onSelectRoomMock}
          onCreateRoom={onCreateRoomMock}
          currentUserId={defaultMockUser.id}
        />
      );
      await user.click(screen.getByRole('button', { name: '+ Group' }));
      expect(await screen.findByText('Create New Group')).toBeInTheDocument();

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);

      expect(screen.queryByText('Create New Group')).not.toBeInTheDocument();
    });
  });
});
