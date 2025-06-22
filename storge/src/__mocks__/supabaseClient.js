// storge/src/__mocks__/supabaseClient.js
import { vi } from 'vitest';

const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockProfile = { id: 'user-123', username: 'TestUser', online_status: false };

let currentSession = null;
let authChangeCallback = null;

export const supabase = {
  auth: {
    getSession: vi.fn().mockImplementation(() => {
      return Promise.resolve(currentSession ? { data: { session: currentSession } } : { data: { session: null } });
    }),
    onAuthStateChange: vi.fn().mockImplementation((callback) => {
      authChangeCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signOut: vi.fn().mockImplementation(() => {
      const oldSession = currentSession;
      currentSession = null;
      if (authChangeCallback) {
        authChangeCallback('SIGNED_OUT', null);
      }
      return Promise.resolve({ error: null });
    }),
    signInWithPassword: vi.fn().mockImplementation(async ({ email, password }) => {
      if (password === 'correctpassword') {
        const session = { user: mockUser, access_token: 'mock-token' };
        currentSession = session;
        if (authChangeCallback) {
          authChangeCallback('SIGNED_IN', session);
        }
        return { data: { session, user: mockUser }, error: null };
      } else {
        return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
      }
    }),
    signUp: vi.fn().mockImplementation(async ({ email, password, options }) => {
      // Simulate new user, or existing unconfirmed user for different test cases
      if (email === 'new@example.com') {
        const newUser = { id: 'new-user-id', email, ...options?.data };
        // For signUp, session might be null until confirmation, or a session is returned if auto-confirm is on.
        // Let's assume auto-confirm is off for this mock, so user is created but needs confirmation.
        // The onAuthStateChange would typically fire with a user but no active session yet, or after confirmation.
        // For simplicity here, we'll just return the user object.
        // In a real scenario, App.jsx's onAuthStateChange would handle the profile creation via trigger.
        return { data: { user: newUser, session: null }, error: null };
      } else if (email === 'exists@example.com') {
        return { data: { user: null, session: null }, error: { message: 'User already registered' } };
      }
      return { data: { user: null, session: null }, error: { message: 'Sign up failed' } };
    }),
    resetPasswordForEmail: vi.fn().mockImplementation(async (email) => {
      if (email === 'exists@example.com') {
        return { data: {}, error: null };
      }
      return { data: {}, error: { message: 'User not found or error sending email' } };
    }),
  },
  from: vi.fn().mockImplementation((tableName) => {
    if (tableName === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((column, value) => {
          if (column === 'id' && value === mockUser.id) {
            return {
              single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
            };
          }
          return { // Default for other IDs or if profile not found
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Profile not found' } }),
          };
        }),
        update: vi.fn().mockImplementation((dataToUpdate) => {
          return {
            eq: vi.fn().mockImplementation((col, val) => {
              return Promise.resolve({ error: null }); // Assume update is successful
            }),
          };
        }),
      };
    }
    // Add mocks for other tables like 'messages' if testing ChatPage directly
    return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null}), // Default mock
    };
  }),
  // Mock realtime features if needed
  channel: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((callback) => {
        // Simulate successful subscription
        // if (callback) callback('SUBSCRIBED');
        return { unsubscribe: vi.fn() };
    }),
    send: vi.fn().mockResolvedValue('ok'),
  }),
  removeChannel: vi.fn(),
};

// Helper to simulate login for tests
export const mockLogin = () => {
  // console.log('Mock login simulation');
  currentSession = { user: mockUser, access_token: 'mock-token' };
  if (authChangeCallback) {
    // console.log('Calling authChangeCallback with SIGNED_IN');
    authChangeCallback('SIGNED_IN', currentSession);
  }
};

export const mockLogout = () => {
  // console.log('Mock logout simulation');
  currentSession = null;
  if (authChangeCallback) {
    // console.log('Calling authChangeCallback with SIGNED_OUT');
    authChangeCallback('SIGNED_OUT', null);
  }
};

export const getAuthChangeCallback = () => authChangeCallback;
export const resetMockSupabase = () => {
  currentSession = null;
  authChangeCallback = null;
  vi.clearAllMocks();
  // Re-apply default mock implementations if they were changed per-test
   supabase.auth.getSession.mockImplementation(() => Promise.resolve(currentSession ? { data: { session: currentSession } } : { data: { session: null } }));
   supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      authChangeCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    supabase.auth.signOut.mockImplementation(() => {
      const oldSession = currentSession;
      currentSession = null;
      if (authChangeCallback) {
        authChangeCallback('SIGNED_OUT', null);
      }
      return Promise.resolve({ error: null });
    });
};
