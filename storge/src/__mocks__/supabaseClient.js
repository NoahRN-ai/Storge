// storge/src/__mocks__/supabaseClient.js
import { vi } from 'vitest';

const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockProfile = { id: 'user-123', username: 'TestUser', online_status: false };

let currentSession = null;
let authChangeCallback = null;

// Mock data stores
let mockProfilesDb = {}; // { 'user-id': { id, username, bio, status_message, ... } }
let mockRoomsDb = {}; // { 'room-id': { id, name, type, created_by, updated_at } }
let mockRoomParticipantsDb = []; // [ { room_id, profile_id, joined_at } ]
let mockMessagesDb = []; // [ { id, text, profile_id, room_id, created_at, profiles: {username} } ]


export const mockUser = { id: 'user-123', email: 'test@example.com' };
// Initialize mockProfilesDb with the default mockUser's profile
mockProfilesDb[mockUser.id] = {
  id: mockUser.id,
  username: 'TestUser',
  online_status: false,
  bio: 'Default bio',
  status_message: 'Default status'
};


export const supabase = {
  auth: {
    getSession: vi.fn().mockImplementation(() => {
      // console.log('Mock getSession called, returning:', currentSession ? { data: { session: currentSession } } : { data: { session: null } });
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
    // console.log(`Mock supabase.from('${tableName}') called`);
    let queryBuilder = {
      _tableName: tableName,
      _filters: [],
      _selectColumns: '*',
      _orderColumn: null,
      _orderAscending: true,
      _limit: null,
      _single: false,

      select: vi.fn().mockImplementation(function(columns = '*') { this._selectColumns = columns; return this; }),
      insert: vi.fn().mockImplementation(function(data) {
        // console.log(`Mock insert into ${this._tableName}:`, data);
        if (this._tableName === 'rooms') {
          const newId = `room-${Object.keys(mockRoomsDb).length + 1}`;
          const newRoom = { ...data, id: newId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          mockRoomsDb[newId] = newRoom;
          // Simulate trigger for adding creator to participants
          if (newRoom.created_by) {
            mockRoomParticipantsDb.push({ room_id: newId, profile_id: newRoom.created_by, joined_at: new Date().toISOString() });
          }
          return this._single ? Promise.resolve({ data: newRoom, error: null }) : Promise.resolve({ data: [newRoom], error: null });
        }
        if (this._tableName === 'messages') {
          const newId = `msg-${mockMessagesDb.length + 1}`;
          const senderProfile = mockProfilesDb[data.profile_id] || { username: 'Unknown' };
          const newMessage = { ...data, id: newId, created_at: new Date().toISOString(), profiles: { username: senderProfile.username } };
          mockMessagesDb.push(newMessage);
           // Simulate trigger to update room's updated_at
          if (data.room_id && mockRoomsDb[data.room_id]) {
            mockRoomsDb[data.room_id].updated_at = new Date().toISOString();
          }
          return this._single ? Promise.resolve({ data: newMessage, error: null }) : Promise.resolve({ data: [newMessage], error: null });
        }
        // Generic insert for other tables if needed
        return Promise.resolve({ data: Array.isArray(data) ? data.map(d => ({...d, id: 'new-mock-id'})) : {...data, id: 'new-mock-id'}, error: null });
      }),
      update: vi.fn().mockImplementation(function(dataToUpdate) {
        // console.log(`Mock update on ${this._tableName} with`, dataToUpdate, `Filters:`, this._filters);
        if (this._tableName === 'profiles') {
          const profileIdToUpdate = this._filters.find(f => f.column === 'id')?.value;
          if (profileIdToUpdate && mockProfilesDb[profileIdToUpdate]) {
            mockProfilesDb[profileIdToUpdate] = { ...mockProfilesDb[profileIdToUpdate], ...dataToUpdate, updated_at: new Date().toISOString() };
            // console.log("Updated profile:", mockProfilesDb[profileIdToUpdate]);
            return this._selectColumns ? Promise.resolve({ data: mockProfilesDb[profileIdToUpdate], error: null }) : Promise.resolve({ error: null });
          }
        }
        return Promise.resolve({ error: { message: 'Update failed or record not found in mock' } });
      }),
      eq: vi.fn().mockImplementation(function(column, value) { this._filters.push({ column, value, type: 'eq' }); return this; }),
      in: vi.fn().mockImplementation(function(column, values) { this._filters.push({ column, value: values, type: 'in' }); return this; }),
      order: vi.fn().mockImplementation(function(column, { ascending = true } = {}) { this._orderColumn = column; this._orderAscending = ascending; return this; }),
      limit: vi.fn().mockImplementation(function(count) { this._limit = count; return this; }),
      single: vi.fn().mockImplementation(function() { this._single = true; return this._execute(); }), // _execute will handle returning a single item

      // Centralized execution logic for select queries
      _execute: vi.fn().mockImplementation(async function() {
        // console.log(`Mock _execute for ${this._tableName} with filters:`, this._filters);
        let results = [];
        if (this._tableName === 'profiles') {
            results = Object.values(mockProfilesDb).filter(p =>
                this._filters.every(f => {
                    if (f.type === 'eq') return p[f.column] === f.value;
                    return true;
                })
            );
        } else if (this._tableName === 'messages') {
            results = mockMessagesDb.filter(m =>
                this._filters.every(f => {
                    if (f.type === 'eq') return m[f.column] === f.value;
                    return true;
                })
            );
        } else if (this._tableName === 'rooms') {
            results = Object.values(mockRoomsDb).filter(r =>
                this._filters.every(f => {
                    if (f.type === 'eq') return r[f.column] === f.value;
                    if (f.type === 'in') return f.value.includes(r[f.column]);
                    return true;
                })
            );
        } else if (this._tableName === 'room_participants') {
            results = mockRoomParticipantsDb.filter(rp =>
                this._filters.every(f => {
                    if (f.type === 'eq') return rp[f.column] === f.value;
                    return true;
                })
            );
        }

        if (this._orderColumn) {
            results.sort((a, b) => {
                if (a[this._orderColumn] < b[this._orderColumn]) return this._orderAscending ? -1 : 1;
                if (a[this._orderColumn] > b[this._orderColumn]) return this._orderAscending ? 1 : -1;
                return 0;
            });
        }
        if (this._limit) results = results.slice(0, this._limit);

        // console.log(`Mock results for ${this._tableName}:`, results);
        if (this._single) {
            return results.length > 0 ? { data: results[0], error: null } : { data: null, error: this._tableName === 'profiles' ? { code: 'PGRST116', message: 'Profile not found in mock' } : null };
        }
        return { data: results, error: null };
      })
    };
    // Attach thenable to queryBuilder for direct await
    queryBuilder.then = function(onFulfilled, onRejected) {
        return this._execute().then(onFulfilled, onRejected);
    };
    return queryBuilder;
  }),
  channel: vi.fn().mockImplementation((channelName) => {
    // console.log(`Mock supabase.channel('${channelName}') called`);
    // Return a more configurable channel mock if needed, or use the existing one from ChatPage.test.jsx
    // For now, a simple version:
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        if (callback) callback('SUBSCRIBED'); // Simulate immediate successful subscription
        return { unsubscribe: vi.fn() };
      }),
      send: vi.fn().mockResolvedValue('ok'),
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
      presenceState: vi.fn().mockReturnValue({}),
    };
    // Store the mock channel instance if tests need to interact with it by name
    // supabase._channels[channelName] = mockChannel;
    return mockChannel;
  }),
  // supabase._channels = {}, // To store named channel mocks if needed for specific tests
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

  // Clear mock data stores
  mockProfilesDb = {};
  // Re-initialize default user profile after clearing
  mockProfilesDb[mockUser.id] = {
    id: mockUser.id,
    username: 'TestUser',
    online_status: false,
    bio: 'Default bio',
    status_message: 'Default status'
  };
  mockRoomsDb = {};
  mockRoomParticipantsDb = [];
  mockMessagesDb = [];

  vi.clearAllMocks(); // Clears call history, etc. from mocks

  // Re-apply default mock function implementations if they might have been overridden in specific tests
  // (Many are already defined with vi.fn() which should reset their call history with clearAllMocks,
  // but the core implementation logic needs to be consistent.)

  supabase.auth.getSession.mockImplementation(() => {
    // console.log('Mock getSession reset and called, returning:', currentSession ? { data: { session: currentSession } } : { data: { session: null } });
    return Promise.resolve(currentSession ? { data: { session: currentSession } } : { data: { session: null } });
  });
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
  // Re-mock supabase.from to ensure it uses the cleared data stores
  supabase.from.mockImplementation((tableName) => {
    // This is a simplified re-application. The full complex mock from above should be here.
    // For brevity in this diff, I'll just show the structure.
    // It's crucial that this re-mocked 'from' uses the now-empty mockDb stores.
    // console.log(`Mock supabase.from('${tableName}') re-applied after reset`);
    let queryBuilder = { /* ... same comprehensive mock as above ... */
        _tableName: tableName,
        _filters: [],
        _selectColumns: '*',
        _orderColumn: null,
        _orderAscending: true,
        _limit: null,
        _single: false,
        select: vi.fn().mockImplementation(function(columns = '*') { this._selectColumns = columns; return this; }),
        insert: vi.fn().mockImplementation(function(data) {
          if (this._tableName === 'rooms') {
            const newId = `room-${Object.keys(mockRoomsDb).length + 1}`;
            const newRoom = { ...data, id: newId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            mockRoomsDb[newId] = newRoom;
            if (newRoom.created_by) mockRoomParticipantsDb.push({ room_id: newId, profile_id: newRoom.created_by, joined_at: new Date().toISOString() });
            return this._single ? Promise.resolve({ data: newRoom, error: null }) : Promise.resolve({ data: [newRoom], error: null });
          }
          if (this._tableName === 'messages') {
            const newId = `msg-${mockMessagesDb.length + 1}`;
            const senderProfile = mockProfilesDb[data.profile_id] || { username: 'Unknown' };
            const newMessage = { ...data, id: newId, created_at: new Date().toISOString(), profiles: { username: senderProfile.username } };
            mockMessagesDb.push(newMessage);
            if (data.room_id && mockRoomsDb[data.room_id]) mockRoomsDb[data.room_id].updated_at = new Date().toISOString();
            return this._single ? Promise.resolve({ data: newMessage, error: null }) : Promise.resolve({ data: [newMessage], error: null });
          }
          return Promise.resolve({ data: Array.isArray(data) ? data.map(d => ({...d, id: 'new-mock-id'})) : {...data, id: 'new-mock-id'}, error: null });
        }),
        update: vi.fn().mockImplementation(function(dataToUpdate) {
          if (this._tableName === 'profiles') {
            const profileIdToUpdate = this._filters.find(f => f.column === 'id')?.value;
            if (profileIdToUpdate && mockProfilesDb[profileIdToUpdate]) {
              mockProfilesDb[profileIdToUpdate] = { ...mockProfilesDb[profileIdToUpdate], ...dataToUpdate, updated_at: new Date().toISOString() };
              return this._selectColumns ? Promise.resolve({ data: mockProfilesDb[profileIdToUpdate], error: null }) : Promise.resolve({ error: null });
            }
          }
          return Promise.resolve({ error: { message: 'Update failed or record not found in mock' } });
        }),
        eq: vi.fn().mockImplementation(function(column, value) { this._filters.push({ column, value, type: 'eq' }); return this; }),
        in: vi.fn().mockImplementation(function(column, values) { this._filters.push({ column, value: values, type: 'in' }); return this; }),
        order: vi.fn().mockImplementation(function(column, { ascending = true } = {}) { this._orderColumn = column; this._orderAscending = ascending; return this; }),
        limit: vi.fn().mockImplementation(function(count) { this._limit = count; return this; }),
        single: vi.fn().mockImplementation(function() { this._single = true; return this._execute(); }),
        _execute: vi.fn().mockImplementation(async function() {
          let results = [];
          if (this._tableName === 'profiles') results = Object.values(mockProfilesDb).filter(p => this._filters.every(f => f.type === 'eq' ? p[f.column] === f.value : true));
          else if (this._tableName === 'messages') results = mockMessagesDb.filter(m => this._filters.every(f => f.type === 'eq' ? m[f.column] === f.value : true));
          else if (this._tableName === 'rooms') results = Object.values(mockRoomsDb).filter(r => this._filters.every(f => f.type === 'eq' ? r[f.column] === f.value : (f.type === 'in' ? f.value.includes(r[f.column]) : true)));
          else if (this._tableName === 'room_participants') results = mockRoomParticipantsDb.filter(rp => this._filters.every(f => f.type === 'eq' ? rp[f.column] === f.value : true));
          if (this._orderColumn) results.sort((a, b) => (a[this._orderColumn] < b[this._orderColumn] ? -1 : 1) * (this._orderAscending ? 1 : -1));
          if (this._limit) results = results.slice(0, this._limit);
          if (this._single) return results.length > 0 ? { data: results[0], error: null } : { data: null, error: this._tableName === 'profiles' ? { code: 'PGRST116', message: 'Profile not found in mock' } : null };
          return { data: results, error: null };
        })
    };
    queryBuilder.then = function(onFulfilled, onRejected) { return this._execute().then(onFulfilled, onRejected); };
    return queryBuilder;
  });

  supabase.channel.mockImplementation((channelName) => {
    // console.log(`Mock supabase.channel('${channelName}') re-applied after reset`);
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        if (callback) callback('SUBSCRIBED');
        return { unsubscribe: vi.fn() };
      }),
      send: vi.fn().mockResolvedValue('ok'),
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
      presenceState: vi.fn().mockReturnValue({}),
    };
    return mockChannel;
  });
};
