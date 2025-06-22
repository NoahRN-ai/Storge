import React, { useState, useEffect, useCallback } from 'react';
import LoginPage from './components/LoginPage';
import ChatPage from './components/ChatPage';
import { supabase } from './supabaseClient'; // Import Supabase client
import './index.css';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

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
    const fetchUserProfileAndSetOnline = async (userId) => {
      if (!userId) {
        setUserProfile(null);
        setLoadingProfile(false);
        return;
      }
      try {
        setLoadingProfile(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, online_status')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Error fetching user profile:', error);
          if (error.code === 'PGRST116') {
            console.warn(`Profile not found for user ${userId}. It might be created shortly.`);
            setUserProfile({ id: userId, username: 'New User (loading...)', online_status: false });
          } else {
            setUserProfile(null);
          }
        } else {
          setUserProfile(data);
          // If profile fetched successfully, mark as online
          if (data) { // ensure data is not null
            await updateUserOnlineStatus(userId, true);
          }
        }
      } catch (e) {
        console.error('Exception fetching user profile:', e);
        setUserProfile(null);
      } finally {
        setLoadingProfile(false);
      }
    };

    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession?.user) {
        await fetchUserProfileAndSetOnline(currentSession.user.id);
      } else {
        setLoadingProfile(false);
        setUserProfile(null);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        const oldUserId = session?.user?.id;
        setSession(newSession);
        if (newSession?.user) {
          await fetchUserProfileAndSetOnline(newSession.user.id);
        } else {
          // User logged out
          if (oldUserId) {
            await updateUserOnlineStatus(oldUserId, false);
          }
          setUserProfile(null);
          setLoadingProfile(false);
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
  }, [session, updateUserOnlineStatus]); // Add updateUserOnlineStatus and session to dependencies


  const handleLogout = async () => {
    if (userProfile?.id) {
      await updateUserOnlineStatus(userProfile.id, false);
    }
    setUserProfile(null); // Clear local profile state immediately
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    }
    // Session state will be updated by onAuthStateChange, which also handles profile
  };

  if (loadingProfile && session) {
    return <div className="app-container">Loading profile...</div>;
  }

  return (
    <div className="app-container">
      {session && userProfile ? (
        <ChatPage userProfile={userProfile} onLogout={handleLogout} />
      ) : (
        <LoginPage />
      )}
    </div>
  );
}

export default App;
