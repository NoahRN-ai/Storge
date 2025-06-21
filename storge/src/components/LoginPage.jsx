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
   // Get the base URL from the Supabase client
   const { data: { supabaseUrl } } = supabase.functions;
   const functionUrl = `${supabaseUrl}/storge-login`;

   const response = await fetch(functionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, pin }),
   });

   const result = await response.json();

   if (!response.ok) {
    throw new Error(result.error || 'Login failed.');
   }

   // On success, call the callback function passed from App.jsx
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
    <select
     name="username"
     value={username}
     onChange={(e) => setUsername(e.target.value)}
    >
     <option value="" disabled>Who are you?</option>
     <option value="shane">shane</option>
     <option value="hazel">hazel</option>
     <option value="willem">willem</option>
    </select>
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
