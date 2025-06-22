import React, { useState, useEffect, useCallback } from 'react';
import LoginPage from './components/LoginPage';
import ChatPage from './components/ChatPage';
import RoomList from './components/RoomList'; // Import RoomList
import { supabase } from './supabaseClient'; // Import Supabase client
import './index.css';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [rooms, setRooms] = useState([]);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Function to fetch/refresh user profile
  const fetchUserProfile = useCallback(async (userId) => {
    if (!userId) {
      setUserProfile(null);
      setLoadingProfile(false);
      return null;
    }
    try {
      setLoadingProfile(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, online_status, bio, status_message') // Added bio and status_message
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        if (error.code === 'PGRST116') { // Profile not found
          console.warn(`Profile not found for user ${userId}. It might be created shortly.`);
          // Create a minimal profile object to avoid breaking UI expecting a profile
          const newUserProfile = { id: userId, username: 'New User (loading...)', online_status: false, bio: '', status_message: '' };
          setUserProfile(newUserProfile);
          return newUserProfile;
        }
        setUserProfile(null);
        return null;
      }
      setUserProfile(data);
      return data;
    } catch (e) {
      console.error('Exception fetching user profile:', e);
      setUserProfile(null);
      return null;
    } finally {
      setLoadingProfile(false);
    }
  }, []); // No dependencies, it's a pure utility based on userId

  const fetchRooms = useCallback(async (userId) => {
    if (!userId) {
      setRooms([]);
      setCurrentRoomId(null);
      setLoadingRooms(false);
      return;
    }
    setLoadingRooms(true);
    try {
      // Fetch room IDs the user is part of
      const { data: participantEntries, error: participantError } = await supabase
        .from('room_participants')
        .select('room_id')
        .eq('profile_id', userId);

      if (participantError) {
        console.error('Error fetching user room participations:', participantError);
        setRooms([]);
        return;
      }

      const roomIds = participantEntries.map(p => p.room_id);
      if (roomIds.length === 0) {
        setRooms([]);
        setCurrentRoomId(null);
        setLoadingRooms(false);
        return;
      }

      // Fetch details of those rooms, ordered by last activity
      const { data: roomDetails, error: roomsError } = await supabase
        .from('rooms')
        .select('*') // Select all columns for now
        .in('id', roomIds)
        .order('updated_at', { ascending: false });

      if (roomsError) {
        console.error('Error fetching rooms:', roomsError);
        setRooms([]);
      } else {
        setRooms(roomDetails || []);
        // Optionally set currentRoomId to the most recently updated room, or null
        if (roomDetails && roomDetails.length > 0) {
          // For now, don't automatically select a room, let user choose.
          // setCurrentRoomId(roomDetails[0].id);
        } else {
          setCurrentRoomId(null);
        }
      }
    } catch (e) {
      console.error('Exception fetching rooms:', e);
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, []); // userId is the implicit dependency via its argument

  const updateUserOnlineStatus = useCallback(async (userId, status) => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ online_status: status, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) {
        console.error(`Error updating online status to ${status}:`, error);
      } else {
        // Optionally update local userProfile state if needed, though fetching often covers this
        if (userProfile && userProfile.id === userId) {
          setUserProfile(prev => prev ? { ...prev, online_status: status } : null);
        }
      }
    } catch (e) {
      console.error(`Exception updating online status to ${status}:`, e);
    }
  }, [userProfile]); // Include userProfile in dependencies if it's used to update state

  useEffect(() => {
    const initializeSessionAndProfile = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);

      if (currentSession?.user) {
        const profile = await fetchUserProfile(currentSession.user.id);
        if (profile) { // Check if profile was fetched successfully
          await updateUserOnlineStatus(currentSession.user.id, true);
          await fetchRooms(currentSession.user.id); // Fetch rooms after profile is loaded
        }
      } else {
        setLoadingProfile(false); // No user, so not loading profile
        setUserProfile(null);
        setRooms([]); // Clear rooms if no user
        setCurrentRoomId(null);
        setLoadingRooms(false);
      }
    };

    initializeSessionAndProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        const oldUserId = session?.user?.id; // Get user ID from previous session state

        setSession(newSession); // Update session state first

        if (newSession?.user) {
          const profile = await fetchUserProfile(newSession.user.id);
          if (profile) { // Check if profile was fetched successfully
            if (oldUserId !== newSession.user.id) { // New login or different user
              await updateUserOnlineStatus(newSession.user.id, true);
              await fetchRooms(newSession.user.id); // Fetch rooms for the new user
            } else {
              // Same user, session might have been refreshed, ensure rooms are still loaded
              // or re-fetch if necessary (e.g. if rooms could change without full re-login)
              if (rooms.length === 0 && !loadingRooms) { // Simple check, might need more robust logic
                await fetchRooms(newSession.user.id);
              }
            }
          }
        } else {
          // User logged out
          if (oldUserId) {
            await updateUserOnlineStatus(oldUserId, false);
          }
          setUserProfile(null);
          setLoadingProfile(false); // Not loading profile if logged out
          setRooms([]);
          setCurrentRoomId(null);
          setLoadingRooms(false);
        }
      }
    );

    // Handle user leaving the page (best effort)
    const handleBeforeUnload = (event) => {
      if (session?.user?.id) {
        // Note: Synchronous XHR/fetch is deprecated in beforeunload.
        // Supabase client uses fetch, which is async. This update might not always complete.
        // For more reliable presence, consider Supabase Realtime presence features.
        updateUserOnlineStatus(session.user.id, false);
        // Some browsers require a returnValue to be set
        // event.preventDefault(); // Not needed unless we want to show a confirmation dialog
        // event.returnValue = ''; // For older browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      authListener?.subscription?.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Attempt to set offline when component unmounts (e.g. navigating away in SPA, not full page unload)
      // This might be redundant if beforeunload fires, but good for some SPA navigations.
      if (session?.user?.id) { // Check current session state from closure
         // updateUserOnlineStatus(session.user.id, false); // This can cause issues if user is just navigating
      }
    };
   }, [session, updateUserOnlineStatus, fetchUserProfile, fetchRooms, rooms, loadingRooms]);


  const handleLogout = async () => {
    if (userProfile?.id) {
      await updateUserOnlineStatus(userProfile.id, false);
    }
    setUserProfile(null); // Clear local profile state immediately
    setRooms([]);
    setCurrentRoomId(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    }
    // Session state will be updated by onAuthStateChange, which also handles profile & rooms
  };

  // Handle selecting a room
  const handleSelectRoom = (roomId) => {
    setCurrentRoomId(roomId);
  };

  // Handle creating a new room and then refreshing the room list
  const handleRoomCreated = async () => {
    if (userProfile?.id) {
      await fetchRooms(userProfile.id);
      // Potentially auto-select the new room, or let user choose from updated list
    }
  };


  if ((loadingProfile || loadingRooms) && session) {
    return <div className="app-container">Loading data...</div>;
  }

  return (
    <div className={`app-container ${session && userProfile ? 'has-full-chat' : ''}`}>
      {session && userProfile ? (
        <div className="main-chat-layout">
          <RoomList
            rooms={rooms}
            currentRoomId={currentRoomId}
            onSelectRoom={handleSelectRoom}
            onCreateRoom={handleRoomCreated} // This is actually onRefreshRoomsNeeded after creation
            currentUserId={userProfile.id}
          />
          <div className="chat-area-container"> {/* Added a wrapper for the chat area */}
            {currentRoomId ? (
              <ChatPage
              key={currentRoomId} // Important: to force re-mount or full update when room changes
              userProfile={userProfile}
              onLogout={handleLogout}
              onProfileUpdate={async () => {
                if (session?.user?.id) {
                  await fetchUserProfile(session.user.id);
                }
              }}
              currentRoomId={currentRoomId} // Pass currentRoomId
              // We might need a way to refresh rooms from ChatPage, e.g. if user is removed from room
            />
          ) : (
            <div className="no-room-selected">
              <h2>Welcome, {userProfile.username}!</h2>
              <p>Select a conversation or start a new one.</p>
              {/* Placeholder for initiating new chats / room list if it's not a separate panel */}
            </div>
          )}
        </div>
      ) : (
        <LoginPage />
      )}
    </div>
  );
}

export default App;
