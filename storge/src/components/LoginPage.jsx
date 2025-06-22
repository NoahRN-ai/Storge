import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient'; // Import the Supabase client

const LoginPage = ({ onLoginSuccess }) => {
 const [username, setUsername] = useState('');
 const [pin, setPin] = useState('');
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);

 const handleFormSubmit = async (event) => {
  event.preventDefault();
  if (!username || pin.length !== 4) return;

  setLoading(true);
  setError('');

  try {
    const { data, error: functionError } = await supabase.functions.invoke('storge-login', {
      body: { username, pin }, // Supabase client stringifies the body by default
    });

    if (functionError) {
      // Handle Supabase specific errors (e.g., network issues, function not found)
      throw new Error(functionError.message || 'Function invocation failed.');
    }

    if (data && data.error) {
      // Handle errors returned by the function itself (e.g., invalid PIN)
      throw new Error(data.error || 'Login failed.');
    }

    // On success, call the callback function passed from App.jsx
    // The actual success message from the function is in data.message if needed
    onLoginSuccess(username);

  } catch (err) {
   setError(err.message);
   setLoading(false);
  }
 };

 return (
  <div>
   <h1>Storge</h1>
   <form className="login-form" onSubmit={handleFormSubmit}>
    <input
      type="text"
      name="username"
      placeholder="Username"
      value={username}
      onChange={(e) => setUsername(e.target.value.toLowerCase())} // Convert to lowercase for consistency
      autoComplete="username"
    />
    <input
     type="password"
     name="pin"
     placeholder="Enter 4-digit PIN"
     autoComplete="current-password"
     maxLength="4"
     value={pin}
     onChange={(e) => setPin(e.target.value)}
    />
    {/* Disable button during login attempt and show loading text */}
    <button type="submit" disabled={!username || pin.length !== 4 || loading}>
     {loading ? 'Logging in...' : 'Login'}
    </button>
    {/* Display any error messages */}
    {error && <p style={{ color: '#ff8a8a', marginTop: '1rem' }}>{error}</p>}
   </form>
  </div>
 );
};

LoginPage.propTypes = {
 onLoginSuccess: PropTypes.func.isRequired,
};

export default LoginPage;
