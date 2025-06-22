import React, { useState } from 'react';
// PropTypes removed as onLoginSuccess is no longer passing data upwards in the same way
// import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient'; // Import the Supabase client

// onLoginSuccess is not strictly needed anymore as App.jsx listens to onAuthStateChange
const LoginPage = (/*{ onLoginSuccess }*/) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(''); // For success/info messages
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState('signIn'); // 'signIn', 'signUp', 'recoverPassword'

  const handleSignIn = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      // onLoginSuccess(data.user) is removed. App.jsx's onAuthStateChange will handle it.
      // setLoading(false) will be handled by the effect of onAuthStateChange in App.jsx
      // or by error catching here.
      if (!data.user) { // Should ideally not happen if no error
        throw new Error('Login failed. Please try again.');
      }
      // Success is handled by onAuthStateChange in App.jsx
      // No explicit call to onLoginSuccess needed here to pass user data

    } catch (err) {
      setError(err.message || 'Failed to sign in.');
    } finally {
      setLoading(false); // Ensure loading is reset in all cases for this action
    }
  };

  const handleSignUp = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setError('Email and password are required for sign up.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        // You can add options here, like data for the user metadata if your trigger doesn't cover everything
        // options: {
        //   data: { username: email.split('@')[0] } // This would be user_metadata, not profile table directly
        // }
      });

      if (signUpError) {
        throw signUpError;
      }

      // The new user trigger in Supabase will create the profile.
      // The onAuthStateChange listener in App.jsx will then fetch this profile.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        // This condition from Supabase might indicate the user already exists but isn't confirmed.
        // Or, if email confirmation is disabled, it might mean they exist and sign-in should be used.
        setMessage('User already exists or confirmation pending. Please try to sign in or check your email for a confirmation link.');
      } else if (data.user) {
        setMessage('Sign up successful! Please check your email to confirm your account. Your profile is being created.');
      } else {
         // This case might not be hit if data.user is null and signUpError is also null, but included for safety.
         setMessage('Sign up process initiated. If you don\'t receive a confirmation email, your account may already exist or requires confirmation.');
      }
    } catch (err) {
      setError(err.message || 'Failed to sign up.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async (event) => {
    event.preventDefault();
    if (!email) {
      setError('Please enter your email address to recover your password.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/', // Redirect to home page after password reset from email
      });

      if (recoveryError) {
        throw recoveryError;
      }
      setMessage('If an account exists for this email, a password recovery link has been sent.');
    } catch (err) {
      setError(err.message || 'Failed to send recovery email.');
    } finally {
      setLoading(false);
    }
  };

  const currentFormSubmit = (e) => {
    e.preventDefault();
    if (authMode === 'signIn') {
      handleSignIn(e);
    } else if (authMode === 'signUp') {
      handleSignUp(e);
    } else if (authMode === 'recoverPassword') {
      handlePasswordRecovery(e);
    }
  };

  const getButtonText = () => {
    if (loading) {
      if (authMode === 'signIn') return 'Signing In...';
      if (authMode === 'signUp') return 'Signing Up...';
      if (authMode === 'recoverPassword') return 'Sending...';
    }
    if (authMode === 'signIn') return 'Sign In';
    if (authMode === 'signUp') return 'Sign Up';
    if (authMode === 'recoverPassword') return 'Recover Password';
    return 'Submit';
  };

  return (
    <div>
      <h1>Storge</h1>
      <form className="login-form" onSubmit={currentFormSubmit}>
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value.toLowerCase())}
          autoComplete="email"
        />
        {authMode !== 'recoverPassword' && (
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoComplete={authMode === 'signIn' ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <button type="submit" disabled={loading || (authMode !== 'recoverPassword' && (!email || !password)) || (authMode === 'recoverPassword' && !email) }>
          {getButtonText()}
        </button>
        {error && <p style={{ color: '#ff8a8a', marginTop: '1rem' }}>Error: {error}</p>}
        {message && <p style={{ color: '#8a8aff', marginTop: '1rem' }}>{message}</p>}
      </form>
      <div className="auth-mode-switcher" style={{ marginTop: '1rem' }}>
        {authMode !== 'signIn' && (
          <button onClick={() => { setAuthMode('signIn'); setError(''); setMessage(''); }}>
            Back to Sign In
          </button>
        )}
        {authMode === 'signIn' && (
          <>
            <button onClick={() => { setAuthMode('signUp'); setError(''); setMessage(''); }}>
              Need an account? Sign Up
            </button>
            <button onClick={() => { setAuthMode('recoverPassword'); setError(''); setMessage(''); }}>
              Forgot Password?
            </button>
          </>
        )}
         {authMode === 'signUp' && (
          <button onClick={() => { setAuthMode('signIn'); setError(''); setMessage(''); }}>
            Already have an account? Sign In
          </button>
        )}
      </div>
    </div>
  );
};

// LoginPage.propTypes = {
//   onLoginSuccess: PropTypes.func.isRequired, // No longer required
// };

export default LoginPage;
