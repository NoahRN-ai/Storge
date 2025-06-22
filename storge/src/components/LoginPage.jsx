import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient'; // Import the Supabase client

const LoginPage = ({ onLoginSuccess }) => {
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

      if (data.user) {
        onLoginSuccess(data.user); // Pass user object on success
      } else {
        throw new Error('Login failed. Please try again.'); // Should not happen if no error
      }
    } catch (err) {
      setError(err.message || 'Failed to sign in.');
      setLoading(false);
    }
    // setLoading(false) will be handled by onLoginSuccess or error catching
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
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setMessage('User already exists. Please try to sign in or recover your password.');
      } else if (data.user) {
        setMessage('Sign up successful! Please check your email to confirm your account.');
      } else {
         setMessage('Sign up successful! Please check your email to confirm your account. If you don\'t see it, try signing in.');
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
        redirectTo: window.location.origin, // Or your specific password reset page
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
          type="email" // Changed from text to email
          name="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value.toLowerCase())}
          autoComplete="email"
        />
        {authMode !== 'recoverPassword' && ( // Password not needed for recovery mode
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

LoginPage.propTypes = {
  onLoginSuccess: PropTypes.func.isRequired,
};

export default LoginPage;
