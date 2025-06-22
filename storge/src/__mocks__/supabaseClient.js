// storge/src/__mocks__/supabaseClient.js
import { vi } from 'vitest';

const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockProfile = { id: 'user-123', username: 'TestUser', online_status: false };

let currentSession = null;
let authChangeCallback = null;

export const supabase = {
  auth: {
    getSession: vi.fn().mockImplementation(() => {
      // console.log('Mock getSession called, returning:', currentSession ? { data: { session: currentSession } } : { data: { session: null } });
      return Promise.resolve(currentSession ? { data: { session: currentSession } } : { data: { session: null } });
    }),
    onAuthStateChange: vi.fn().mockImplementation((callback) => {
      // console.log('Mock onAuthStateChange registered');
      authChangeCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signOut: vi.fn().mockImplementation(() => {
      // console.log('Mock signOut called');
      const oldSession = currentSession;
      currentSession = null;
      if (authChangeCallback) {
        authChangeCallback('SIGNED_OUT', null);
      }
      return Promise.resolve({ error: null });
    }),
    // Add mock implementations for signInWithPassword, signUp, etc. if needed for LoginPage tests
  },
  from: vi.fn().mockImplementation((tableName) => {
    // console.log(`Mock from called with table: ${tableName}`);
    if (tableName === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((column, value) => {
          // console.log(`Mock eq called on profiles: ${column} = ${value}`);
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
          // console.log('Mock profiles update called with:', dataToUpdate);
          return {
            eq: vi.fn().mockImplementation((col, val) => {
              // console.log(`Mock profiles update eq: ${col} = ${val}`);
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
