import React, { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import ChatPage from './components/ChatPage';
import { supabase } from './supabaseClient'; // Import Supabase client
import './index.css';

function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null); // Keep user object for displaying info

  useEffect(() => {
    // Check for an active session on initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    // Listen for auth state changes (login, logout)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    // Cleanup listener on component unmount
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    // setUser is now handled by onAuthStateChange,
    // but we can keep this function if LoginPage needs to do something immediately after login
    // For now, we'll just ensure the user state is updated based on the session.
    // If loggedInUser is directly from signIn, it might be useful.
    // However, onAuthStateChange is the primary source of truth for session state.
    setUser(loggedInUser);
    // No need to manually set isLoggedIn, it's derived from `session`
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    }
    // Session and user state will be updated by onAuthStateChange
  };

  return (
    <div className="app-container">
      {session && user ? ( // Check if session and user exist
        <ChatPage user={user} onLogout={handleLogout} />
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
}

export default App;
