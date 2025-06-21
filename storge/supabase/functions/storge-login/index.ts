import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Define the list of valid users
const VALID_USERS = ['shane', 'hazel', 'willem'];
const UNIVERSAL_PIN = '2215';

serve(async (req: Request) => {
 // This is needed for the browser to be able to make a request from a different origin.
 // It's a pre-flight request that asks for permission to make the actual request.
 if (req.method === 'OPTIONS') {
  return new Response('ok', {
   headers: {
    'Access-Control-Allow-Origin': '*', // Or your specific app URL
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
   },
  });
 }

 try {
  const { username, pin } = await req.json();

  // Validate the input
  if (!username || !pin) {
   return new Response(JSON.stringify({ error: 'Username and PIN are required.' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
   });
  }

  // Check if the login credentials are correct
  if (VALID_USERS.includes(username.toLowerCase()) && pin === UNIVERSAL_PIN) {
   // Successful login
   return new Response(JSON.stringify({ message: `Welcome, ${username}!` }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
   });
  } else {
   // Invalid credentials
   return new Response(JSON.stringify({ error: 'Invalid username or PIN.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
   });
  }
 } catch (error) {
  return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
   status: 400,
   headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
 }
});
