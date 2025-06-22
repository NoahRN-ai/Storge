import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChatPage from './ChatPage';
import { supabase, resetMockSupabase, mockUser as defaultMockUserProfile } from '../__mocks__/supabaseClient';

// Mock the supabaseClient module
vi.mock('../supabaseClient', async (importOriginal) => {
  const actual = await importOriginal();
  const mock = await import('../__mocks__/supabaseClient'); // Ensure this path is correct
  return {
    ...actual,
    supabase: mock.supabase,
    mockUser: mock.mockUser, // if you export it from mock
    resetMockSupabase: mock.resetMockSupabase,
  };
});

const mockUserProfile = {
  id: defaultMockUserProfile.id,
  username: defaultMockUserProfile.username,
  // Add bio and status_message if ChatPage uses them directly, though it gets them via userProfile prop
};

// Sample messages for a specific room
const MOCK_ROOM_ID = 'room-test-123';
const mockRoomMessages = [
  { id: 'msg1', room_id: MOCK_ROOM_ID, text: 'Hello Room', created_at: new Date().toISOString(), profile_id: 'user-other', profiles: { username: 'OtherUserInRoom' } },
  { id: 'msg2', room_id: MOCK_ROOM_ID, text: 'Hi Room', created_at: new Date().toISOString(), profile_id: mockUserProfile.id, profiles: { username: mockUserProfile.username } },
];
const anotherRoomMessages = [ // Messages for a different room, should not be displayed
  { id: 'msg3', room_id: 'other-room-456', text: 'Message for another room', created_at: new Date().toISOString(), profile_id: 'user-other', profiles: { username: 'AnotherUser' } },
];


describe('ChatPage Component (Room Specific)', () => {
  let mockSupabaseChannelInstance; // To hold the specific channel mock for room interactions

  beforeEach(() => {
    resetMockSupabase(); // This now resets the mock DBs

    // Mock supabase.from() to use the in-memory DB from the enhanced mock
    // The global mock in __mocks__/supabaseClient.js should handle this,
    // but we can override specific table behaviors here if needed for a test.
    // For ChatPage, 'messages' and 'profiles' are primary.

    // Specific mock for channel creation for THIS test suite for ChatPage
    // This allows us to interact with the channel instance (e.g., simulate events)
    mockSupabaseChannelInstance = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb) => { if (cb) cb('SUBSCRIBED'); return { unsubscribe: vi.fn() }; }),
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
      send: vi.fn().mockResolvedValue('ok'),
      presenceState: vi.fn().mockReturnValue({}),
      // Store callbacks to simulate events (similar to the old ChatPage test)
      _postgresChangesCallbacks: [], // For specific `public:messages:room_id=eq.${MOCK_ROOM_ID}`
      _presenceSyncCallbacks: [],
      _presenceJoinCallbacks: [],
      _presenceLeaveCallbacks: [],
      _broadcastCallbacks: {}, // eventName: [callbacks]
      _on: function(event, filter, callback) {
        if (event === 'postgres_changes' && filter.table === 'messages') this._postgresChangesCallbacks.push(callback);
        else if (event === 'presence' && filter.event === 'sync') this._presenceSyncCallbacks.push(callback);
        else if (event === 'presence' && filter.event === 'join') this._presenceJoinCallbacks.push(callback);
        else if (event === 'presence' && filter.event === 'leave') this._presenceLeaveCallbacks.push(callback);
        else if (event === 'broadcast') {
            if (!this._broadcastCallbacks[filter.event]) this._broadcastCallbacks[filter.event] = [];
            this._broadcastCallbacks[filter.event].push(callback);
        }
        return this;
      },
      simulatePostgresChange: function(payload) { this._postgresChangesCallbacks.forEach(cb => cb(payload)); },
      simulatePresenceSync: function() { this._presenceSyncCallbacks.forEach(cb => cb(this.presenceState())); },
      simulatePresenceJoin: function(key, newPresences) { this._presenceJoinCallbacks.forEach(cb => cb({ key, newPresences })); },
      simulatePresenceLeave: function(key, leftPresences) { this._presenceLeaveCallbacks.forEach(cb => cb({ key, leftPresences })); },
      simulateBroadcast: function(eventName, payload) { if (this._broadcastCallbacks[eventName]) this._broadcastCallbacks[eventName].forEach(cb => cb(payload));}
    };
    mockSupabaseChannelInstance.on = mockSupabaseChannelInstance._on; // Assign the extended 'on'

    // When supabase.channel is called, return our controllable instance
    supabase.channel.mockImplementation((channelName) => {
      // Tests can check if `channelName` is correct (e.g., `room-channel-${MOCK_ROOM_ID}`)
      // console.log(`Test: supabase.channel called with: ${channelName}`);
      return mockSupabaseChannelInstance;
    });

    // Pre-populate mock DB for message fetching
    // The global mock will use these values now.
    // Make sure resetMockSupabase clears these if they are set directly (it does via mockMessagesDb = [])
    // For this test, we'll ensure mockMessagesDb has our room-specific messages.
    global.mockMessagesDb = [...mockRoomMessages, ...anotherRoomMessages]; // Using global from mock for now
                                                                        // Better: supabase.from().insert() in test setup
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.mockMessagesDb = []; // Clean up global mock data if modified
  });

  const defaultProps = {
    userProfile: mockUserProfile,
    onLogout: vi.fn(),
    onProfileUpdate: vi.fn(),
    currentRoomId: MOCK_ROOM_ID,
  };

  it('renders loading state then messages for the current room', async () => {
    render(<ChatPage {...defaultProps} />);
    expect(screen.getByText(`Loading chat for room...`)).toBeInTheDocument(); // Updated loading text

    await waitFor(() => {
      expect(screen.getByText('Hello Room')).toBeInTheDocument();
      expect(screen.getByText('Hi Room')).toBeInTheDocument();
      expect(screen.queryByText('Message for another room')).not.toBeInTheDocument();
    });

    // Check if supabase.from('messages').select().eq('room_id', MOCK_ROOM_ID) was called by the component.
    // This assertion depends on how you've structured your global Supabase mock.
    // The global mock's `_execute` function now handles filtering.
    // We can check the call to `eq` on the mock `from('messages')` object.
    // This is a bit indirect. A more direct way is to ensure the mock for `from('messages')` itself
    // has an `eq` mock that we can inspect. The enhanced global mock does this.
    // Let's assume the global mock filters correctly.
  });

  it('sends a message with the correct room_id', async () => {
    const user = userEvent.setup();
    render(<ChatPage {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Hello Room')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    await user.type(input, 'Test room message');
    await user.click(sendButton);

    await waitFor(() => {
      // The global mock's `insert` for 'messages' will be called.
      // We expect it to have been called with the room_id.
      // The actual check of `supabase.from('messages').insert` is on the global mock.
      // We need to ensure our mock's `insert` was called with the correct data.
      // This requires the `supabase.from()` mock to return an object whose `insert` is a spy.
      // The enhanced mock in `__mocks__/supabaseClient.js` does this.
      expect(supabase.from('messages').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test room message',
          profile_id: mockUserProfile.id,
          room_id: MOCK_ROOM_ID,
        })
      );
    });
    expect(input.value).toBe('');
  });

  it('displays new messages for the current room via subscription', async () => {
    render(<ChatPage {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Hello Room')).toBeInTheDocument());

    const newMessagePayload = {
      new: { id: 'msg-realtime', room_id: MOCK_ROOM_ID, text: 'Realtime Room Message!', created_at: new Date().toISOString(), profile_id: 'user-realtime', profiles: { username: 'RealtimeSender' } },
      table: 'messages', schema: 'public', event: 'INSERT',
    };

    // Simulate the message coming through the channel this component subscribed to.
    act(() => {
      mockSupabaseChannelInstance.simulatePostgresChange(newMessagePayload);
    });

    await waitFor(() => {
      expect(screen.getByText('Realtime Room Message!')).toBeInTheDocument();
    });

    // Ensure a message for another room is NOT displayed
    const otherRoomMessagePayload = {
       new: { id: 'msg-other-room', room_id: 'some-other-room-id', text: 'Should not appear', created_at: new Date().toISOString(), profile_id: 'user-other', profiles: { username: 'OtherRoomSender' } },
       table: 'messages', schema: 'public', event: 'INSERT',
    };
    act(() => {
      mockSupabaseChannelInstance.simulatePostgresChange(otherRoomMessagePayload);
    });
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();

  });

  it('shows typing indicator specific to the room', async () => {
    render(<ChatPage {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Hello Room')).toBeInTheDocument());

    act(() => {
      mockSupabaseChannelInstance.simulateBroadcast('typing', { // Assuming 'typing' is the event name
        payload: { userId: 'user-other-typing', username: 'TyperInRoom', isTyping: true },
      });
    });
    await waitFor(() => expect(screen.getByText('TyperInRoom is typing...')).toBeInTheDocument());

    act(() => {
      mockSupabaseChannelInstance.simulateBroadcast('typing', {
        payload: { userId: 'user-other-typing', username: 'TyperInRoom', isTyping: false },
      });
    });
    await waitFor(() => expect(screen.queryByText('TyperInRoom is typing...')).not.toBeInTheDocument());
  });

  it('displays online status from presence in the current room', async () => {
    render(<ChatPage {...defaultProps} />);
    await waitFor(() => screen.getByText('Hello Room'));

    const otherUserKey = 'other-user-in-room-key';
    const otherUsername = 'OnlineFellow';
    act(() => {
        mockSupabaseChannelInstance.simulatePresenceJoin(otherUserKey, [{ user_id: otherUserKey, username: otherUsername, online_at: new Date().toISOString() }]);
    });

    // To test this, we need a message from 'OnlineFellow'/'other-user-in-room-key'
    // Let's add one to the mock DB before rendering or simulate receiving one.
    // For simplicity, we'll assume the presence update itself should trigger a re-render
    // that causes `isUserOnlineInRoom` to be re-evaluated for existing messages if any.
    // If OtherUserInRoom (from mockRoomMessages) has id 'user-other', let's test that.

    // Simulate 'user-other' (OtherUserInRoom) coming online in this room
     act(() => {
        mockSupabaseChannelInstance.simulatePresenceJoin('user-other', [{ user_id: 'user-other', username: 'OtherUserInRoom', online_at: new Date().toISOString() }]);
    });

    await waitFor(() => {
        const otherUserMessages = screen.getAllByText('OtherUserInRoom'); // Author of 'Hello Room'
        otherUserMessages.forEach(msgAuthorElement => {
            const parentMessageItem = msgAuthorElement.closest('.message-item.received'); // Ensure it's a received message
            if (parentMessageItem) {
              const statusIndicator = parentMessageItem.querySelector('.status-indicator.online');
              expect(statusIndicator).toBeInTheDocument();
            }
        });
    });
  });

  it('does not display messages if currentRoomId is null', async () => {
    render(<ChatPage {...defaultProps} currentRoomId={null} />);
    // Should not show "Loading chat..." indefinitely or try to fetch.
    // The component should handle null currentRoomId gracefully.
    // Depending on implementation, it might show nothing or a placeholder.
    // ChatPage's useEffect for fetching now returns early if !currentRoomId.
    await waitFor(() => {
        expect(screen.queryByText('Loading chat for room...')).not.toBeInTheDocument();
        expect(screen.queryByText('Hello Room')).not.toBeInTheDocument();
    });
    // It should display the header, though.
    expect(screen.getByRole('banner')).toBeInTheDocument(); // The <header> element
    // The h1 in header shows roomDisplayName which would be "Room: N/A"
    expect(screen.getByRole('heading', {name: /Room: N\/A/i})).toBeInTheDocument();

  });

});

// Helper to wrap state updates in tests
import { act } from 'react';
