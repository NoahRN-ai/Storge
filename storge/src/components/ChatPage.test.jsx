import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChatPage from './ChatPage';
import { supabase, resetMockSupabase, mockUser as defaultMockUserProfile } from '../__mocks__/supabaseClient';

// Mock the supabaseClient module
vi.mock('../supabaseClient', async () => {
  const mock = await import('../__mocks__/supabaseClient');
  return {
    supabase: mock.supabase, // Provide only the mocked supabase instance for the '../supabaseClient' path
  };
});

// Helpers and mock data are imported directly from the __mocks__ file by the test
import { resetMockSupabase, mockUser as defaultMockUserProfile } from '../__mocks__/supabaseClient';


const mockUserProfile = { // userProfile prop passed to ChatPage
  id: defaultMockUserProfile.id,
  username: defaultMockUserProfile.username,
  avatar_url: 'https://mock.url/user-123.png' // Current user's avatar
};

// Sample messages for a specific room
const MOCK_ROOM_ID = 'room-test-123';
const mockRoomMessages = [
  {
    id: 'msg1',
    room_id: MOCK_ROOM_ID,
    text: 'Hello Room',
    created_at: new Date().toISOString(),
    profile_id: 'user-other',
    profiles: { username: 'OtherUserInRoom', avatar_url: 'https://mock.url/other-user.png' }
  },
  {
    id: 'msg2',
    room_id: MOCK_ROOM_ID,
    text: 'Hi Room',
    created_at: new Date().toISOString(),
    profile_id: mockUserProfile.id,
    profiles: { username: mockUserProfile.username, avatar_url: mockUserProfile.avatar_url }
  },
];
const anotherRoomMessages = [
  { id: 'msg3', room_id: 'other-room-456', text: 'Message for another room', created_at: new Date().toISOString(), profile_id: 'user-other', profiles: { username: 'AnotherUser', avatar_url: null } },
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

  it('displays user avatars in messages or placeholders', async () => {
    render(<ChatPage {...defaultProps} />);
    await waitFor(() => {
      // Message from OtherUserInRoom (has avatar_url)
      const otherUserAvatar = screen.getByAltText("OtherUserInRoom's avatar");
      expect(otherUserAvatar).toBeInTheDocument();
      expect(otherUserAvatar).toHaveAttribute('src', mockRoomMessages[0].profiles.avatar_url);

      // Message from current user (mockUserProfile, has avatar_url) - current user's messages don't show author line by default
      // To test this, we'd need a message from another user who has a null avatar_url
    });

    // Test placeholder (add a message from a user with null avatar_url to mockRoomMessages for this)
    const messagesWithNullAvatar = [
      ...mockRoomMessages,
      { id: 'msg-no-avatar', room_id: MOCK_ROOM_ID, text: 'No Avatar Here', created_at: new Date().toISOString(), profile_id: 'user-no-avatar', profiles: { username: 'NoAvatarUser', avatar_url: null } }
    ];
    global.mockMessagesDb = messagesWithNullAvatar; // Update mock DB for this specific check

    render(<ChatPage {...defaultProps} />); // Re-render with updated messages
    await waitFor(() => {
      expect(screen.getByText('No Avatar Here')).toBeInTheDocument();
      const placeholder = screen.getByText('N'); // Placeholder for 'NoAvatarUser'
      expect(placeholder).toHaveClass('chat-avatar-placeholder');
    });
  });

  describe('Browser Notifications', () => {
    let mockNotification;
    let originalNotificationPermission;

    beforeEach(() => {
      mockNotification = vi.fn(); // Mock for `new Notification()`
      originalNotificationPermission = Notification.permission; // Store original

      // Mock Notification API
      global.Notification = {
        requestPermission: vi.fn().mockResolvedValue('default'),
        permission: 'default', // Initial state
        // @ts-ignore
        prototype: { close: vi.fn() } // Mock close method on prototype
      };
      vi.spyOn(global.Notification, 'permission', 'get'); // Spy on getter
      global.Notification.prototype.constructor = mockNotification; // Mock the constructor

      // Mock document.hidden
      Object.defineProperty(document, 'hidden', { value: false, writable: true });
    });

    afterEach(() => {
      // Restore Notification API
      global.Notification.permission = originalNotificationPermission;
      vi.restoreAllMocks(); // This should restore spied getters too
      delete global.Notification.prototype.constructor; // Clean up constructor mock
    });

    it('shows "Enable Notifications" button when permission is default', () => {
      global.Notification.permission = 'default';
      render(<ChatPage {...defaultProps} />);
      expect(screen.getByRole('button', { name: /🔔 Enable Notifications/i })).toBeInTheDocument();
    });

    it('shows "Notifications Blocked" button when permission is denied', () => {
      global.Notification.permission = 'denied';
      render(<ChatPage {...defaultProps} />);
      expect(screen.getByRole('button', { name: /🔕 Notifications Blocked/i })).toBeInTheDocument();
    });

    it('requests permission when "Enable Notifications" button is clicked', async () => {
      const user = userEvent.setup();
      global.Notification.permission = 'default';
      Notification.requestPermission.mockResolvedValueOnce('granted'); // Simulate granting permission

      render(<ChatPage {...defaultProps} />);
      const enableButton = screen.getByRole('button', { name: /🔔 Enable Notifications/i });
      await user.click(enableButton);

      expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
      await waitFor(() => { // Wait for state update
        expect(screen.queryByRole('button', { name: /🔔 Enable Notifications/i })).not.toBeInTheDocument();
      });
    });

    it('shows notification for new message when tab is hidden and permission granted', async () => {
      global.Notification.permission = 'granted';
      // @ts-ignore
      document.hidden = true; // Simulate tab being hidden

      render(<ChatPage {...defaultProps} />);
      await waitFor(() => expect(screen.getByText('Hello Room')).toBeInTheDocument()); // Ensure page loaded

      const newMessagePayload = {
        new: {
          id: 'msg-notify',
          room_id: MOCK_ROOM_ID,
          text: 'Notification Test!',
          created_at: new Date().toISOString(),
          profile_id: 'user-notify-sender', // Different from current user
          profiles: { username: 'NotifySender', avatar_url: 'https://mock.url/notify-sender.png' }
        },
        table: 'messages', schema: 'public', event: 'INSERT',
      };

      act(() => {
        mockSupabaseChannelInstance.simulatePostgresChange(newMessagePayload);
      });

      await waitFor(() => {
        expect(mockNotification).toHaveBeenCalledWith(
          'New message from NotifySender',
          expect.objectContaining({
            body: 'Notification Test!',
            icon: 'https://mock.url/notify-sender.png',
            tag: MOCK_ROOM_ID,
            data: { roomId: MOCK_ROOM_ID }
          })
        );
      });
    });

    it('does NOT show notification if tab is active OR message is from self OR permission not granted', async () => {
      // Case 1: Tab active
      global.Notification.permission = 'granted';
      // @ts-ignore
      document.hidden = false;
      render(<ChatPage {...defaultProps} />);
      await waitFor(() => expect(screen.getByText('Hello Room')).toBeInTheDocument());
      const msgPayload = { new: { ...mockRoomMessages[0], profile_id: 'other-user-id' /* from other */ } };
      act(() => mockSupabaseChannelInstance.simulatePostgresChange(msgPayload) );
      expect(mockNotification).not.toHaveBeenCalled();
      mockNotification.mockClear();

      // Case 2: Message from self
      global.Notification.permission = 'granted';
      // @ts-ignore
      document.hidden = true;
      const selfMsgPayload = { new: { ...mockRoomMessages[1], profile_id: mockUserProfile.id /* from self */ } };
      act(() => mockSupabaseChannelInstance.simulatePostgresChange(selfMsgPayload) );
      expect(mockNotification).not.toHaveBeenCalled();
      mockNotification.mockClear();

      // Case 3: Permission not granted
      global.Notification.permission = 'default';
      // @ts-ignore
      document.hidden = true;
      act(() => mockSupabaseChannelInstance.simulatePostgresChange(msgPayload) );
      expect(mockNotification).not.toHaveBeenCalled();
    });

    it('handles notification click (focuses window, logs/alerts for room navigation)', async () => {
      global.Notification.permission = 'granted';
      // @ts-ignore
      document.hidden = true; // Tab is hidden
      const mockClose = vi.fn();
      mockNotification.mockImplementation((title, options) => {
        // Simulate the created notification object
        return {
          onclick: null, // Will be assigned by ChatPage's showNotification
          close: mockClose,
          title,
          ...options,
        };
      });
      window.parent.focus = vi.fn(); // Mock window focus
      window.alert = vi.fn(); // Mock alert

      render(<ChatPage {...defaultProps} />); // currentRoomId is MOCK_ROOM_ID
      await waitFor(() => expect(screen.getByText('Hello Room')).toBeInTheDocument());

      const OTHER_ROOM_ID = 'other-room-for-notification-click';
      const newMessageInOtherRoom = {
        new: { id: 'msg-click', room_id: OTHER_ROOM_ID, text: 'Click me!', created_at: new Date().toISOString(), profile_id: 'clicker', profiles: { username: 'ClickSender' } },
        table: 'messages', schema: 'public', event: 'INSERT',
      };

      act(() => {
        mockSupabaseChannelInstance.simulatePostgresChange(newMessageInOtherRoom);
      });

      await waitFor(() => expect(mockNotification).toHaveBeenCalled());

      // Simulate the notification click
      // The `onclick` handler is attached to the instance created by `new Notification`
      // We need to grab that instance or its `onclick`.
      const notificationInstance = mockNotification.mock.results[0].value;
      expect(notificationInstance.onclick).toBeInstanceOf(Function);

      act(() => {
        notificationInstance.onclick({ target: notificationInstance }); // Simulate click event
      });

      expect(window.parent.focus).toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(OTHER_ROOM_ID)); // Alert for different room
      expect(mockClose).toHaveBeenCalled(); // Notification should be closed
    });
  });
});

// Helper to wrap state updates in tests
import { act } from 'react';
