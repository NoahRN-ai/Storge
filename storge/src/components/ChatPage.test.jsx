import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChatPage from './ChatPage';
import { supabase, resetMockSupabase, mockUser as defaultMockUserProfile } from '../__mocks__/supabaseClient';

// Mock the supabaseClient module
vi.mock('../supabaseClient', async (importOriginal) => {
  const actual = await importOriginal();
  const mock = await import('../__mocks__/supabaseClient');
  return {
    ...actual,
    supabase: mock.supabase,
    mockUser: mock.mockUser,
    resetMockSupabase: mock.resetMockSupabase,
  };
});

const mockUserProfile = {
  id: defaultMockUserProfile.id, // 'user-123'
  username: defaultMockUserProfile.username, // 'TestUser'
};

const mockMessages = [
  { id: 'msg1', text: 'Hello', created_at: new Date().toISOString(), profile_id: 'user-other', profiles: { username: 'OtherUser' } },
  { id: 'msg2', text: 'Hi there', created_at: new Date().toISOString(), profile_id: mockUserProfile.id, profiles: { username: mockUserProfile.username } },
];

describe('ChatPage Component', () => {
  let mockSupabaseChannel;

  beforeEach(() => {
    resetMockSupabase();

    // Setup default mock for supabase.from('messages').select()
    supabase.from.mockImplementation((tableName) => {
      if (tableName === 'messages') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMessages, error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }), // Mock for sending messages
        };
      }
      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { username: 'FetchedProfile' }, error: null })
        }
      }
      return { // Default empty mock for other tables
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    // Setup default mock for supabase.channel()
    mockSupabaseChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(callback => {
        // Simulate successful subscription immediately for presence sync
        // If a callback is passed to subscribe by the test, invoke it.
        if (typeof callback === 'function') {
          callback('SUBSCRIBED');
        }
        // Simulate presence sync for the current user
        if (this.presenceCallback) { // 'this' might be tricky, ensure correct scope or pass presenceCallback
             const presenceState = { [mockUserProfile.id]: [{ user_id: mockUserProfile.id, username: mockUserProfile.username, online_at: new Date().toISOString() }] };
             this.presenceSyncCallback(presenceState);
        }
        return { unsubscribe: vi.fn() };
      }),
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
      send: vi.fn().mockResolvedValue('ok'),
      presenceState: vi.fn().mockReturnValue({
        [mockUserProfile.id]: [{ user_id: mockUserProfile.id, username: mockUserProfile.username, online_at: new Date().toISOString() }]
      }),
       // Store callbacks to simulate events
      _postgresChangesCallbacks: [],
      _presenceSyncCallbacks: [],
      _presenceJoinCallbacks: [],
      _presenceLeaveCallbacks: [],
      _broadcastCallbacks: {}, // eventName: [callbacks]

      // Extended mock 'on' to store callbacks by event type
      _on: function(event, filter, callback) {
        if (event === 'postgres_changes') this._postgresChangesCallbacks.push(callback);
        else if (event === 'presence' && filter.event === 'sync') this._presenceSyncCallbacks.push(callback);
        else if (event === 'presence' && filter.event === 'join') this._presenceJoinCallbacks.push(callback);
        else if (event === 'presence' && filter.event === 'leave') this._presenceLeaveCallbacks.push(callback);
        else if (event === 'broadcast') {
            if (!this._broadcastCallbacks[filter.event]) this._broadcastCallbacks[filter.event] = [];
            this._broadcastCallbacks[filter.event].push(callback);
        }
        return this; // Return 'this' to allow chaining
      },
       // Helper to simulate receiving a Postgres change event
      simulatePostgresChange: function(payload) {
        this._postgresChangesCallbacks.forEach(cb => cb(payload));
      },
      // Helper to simulate receiving a presence sync event
      simulatePresenceSync: function() {
        const state = this.presenceState(); // Get current mocked presence state
        this._presenceSyncCallbacks.forEach(cb => cb(state)); // Pass the whole state map
      },
       simulatePresenceJoin: function(key, newPresences) {
        this._presenceJoinCallbacks.forEach(cb => cb({ key, newPresences }));
      },
      simulatePresenceLeave: function(key, leftPresences) {
        this._presenceLeaveCallbacks.forEach(cb => cb({ key, leftPresences }));
      },
      // Helper to simulate receiving a broadcast event
      simulateBroadcast: function(eventName, payload) {
        if (this._broadcastCallbacks[eventName]) {
          this._broadcastCallbacks[eventName].forEach(cb => cb(payload));
        }
      }
    };
    // Replace the 'on' method with our extended version for storing callbacks
    mockSupabaseChannel.on = mockSupabaseChannel._on;


    supabase.channel.mockReturnValue(mockSupabaseChannel);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially then messages', async () => {
    render(<ChatPage userProfile={mockUserProfile} onLogout={vi.fn()} />);
    expect(screen.getByText('Loading chat...')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there')).toBeInTheDocument();
    });
  });

  it('allows user to type and send a message', async () => {
    const user = userEvent.setup();
    render(<ChatPage userProfile={mockUserProfile} onLogout={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument()); // Ensure initial messages loaded

    const input = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    await user.type(input, 'Test message');
    expect(input.value).toBe('Test message');
    await user.click(sendButton);

    await waitFor(() => {
      expect(supabase.from('messages').insert).toHaveBeenCalledWith({
        text: 'Test message',
        profile_id: mockUserProfile.id,
      });
    });
    expect(input.value).toBe(''); // Input should clear after sending
  });

  it('displays new messages received via Supabase subscription', async () => {
    render(<ChatPage userProfile={mockUserProfile} onLogout={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());

    const newMessagePayload = {
      new: { id: 'msg3', text: 'Realtime message!', created_at: new Date().toISOString(), profile_id: 'user-other-2', profiles: { username: 'OtherUser2' } },
      table: 'messages',
      schema: 'public',
      event: 'INSERT',
    };

    // Simulate receiving the message via the stored callback
    act(() => { // Ensure state updates are wrapped in act
        mockSupabaseChannel.simulatePostgresChange(newMessagePayload);
    });

    await waitFor(() => {
      expect(screen.getByText('Realtime message!')).toBeInTheDocument();
      expect(screen.getByText('OtherUser2')).toBeInTheDocument();
    });
  });

  it('shows typing indicator when other users are typing', async () => {
    render(<ChatPage userProfile={mockUserProfile} onLogout={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());

    act(() => {
      mockSupabaseChannel.simulateBroadcast('typing', {
        payload: { userId: 'user-other', username: 'OtherUser', isTyping: true },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('OtherUser is typing...')).toBeInTheDocument();
    });

    act(() => {
        mockSupabaseChannel.simulateBroadcast('typing', {
            payload: { userId: 'user-other', username: 'OtherUser', isTyping: false },
        });
    });

    await waitFor(() => {
      expect(screen.queryByText('OtherUser is typing...')).not.toBeInTheDocument();
    });
  });

  it('sends typing events when user types', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers(); // Use fake timers for setTimeout in typing indicator
    render(<ChatPage userProfile={mockUserProfile} onLogout={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Type your message...');
    await user.type(input, 'T');

    await waitFor(() => {
      expect(mockSupabaseChannel.send).toHaveBeenCalledWith(expect.objectContaining({
        event: 'typing',
        payload: { userId: mockUserProfile.id, username: mockUserProfile.username, isTyping: true },
      }));
    });

    // Fast-forward time to trigger the typing_stopped timeout
    act(() => {
        vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(mockSupabaseChannel.send).toHaveBeenCalledWith(expect.objectContaining({
        event: 'typing',
        payload: { userId: mockUserProfile.id, username: mockUserProfile.username, isTyping: false },
      }));
    });
    vi.useRealTimers(); // Restore real timers
  });

  it('displays online status from presence', async () => {
    render(<ChatPage userProfile={mockUserProfile} onLogout={vi.fn()} />);

    // Initial messages should load
    await waitFor(() => screen.getByText('Hello'));

    // Simulate another user joining
    const otherUserJoined = { key: 'user-other', newPresences: [{ user_id: 'user-other', username: 'OtherUser', online_at: new Date().toISOString() }] };
    act(() => {
        mockSupabaseChannel.simulatePresenceJoin(otherUserJoined.key, otherUserJoined.newPresences);
    });

    // Check if "OtherUser" is now considered online for their message
    // This requires messages to re-render or their status part to update.
    // The current message rendering logic uses isUserOnline(msg.profile_id)
    await waitFor(() => {
        const otherUserMessages = screen.getAllByText('OtherUser');
        otherUserMessages.forEach(msgAuthorElement => {
            const parentMessageItem = msgAuthorElement.closest('.message-item');
            const statusIndicator = parentMessageItem.querySelector('.status-indicator.online');
            expect(statusIndicator).toBeInTheDocument();
        });
    });
  });

});

// Helper to wrap state updates in tests
import { act } from 'react';
