import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Define the list of valid users
// TODO: This is a temporary measure. User management should ideally be moved to a database.
const VALID_USERS = ['shane', 'hazel', 'willem'];
const UNIVERSAL_PIN = Deno.env.get("APP_PIN");

serve(async (req: Request) => {
 // This is needed for the browser to be able to make a request from a different origin.
 // It's a pre-flight request that asks for permission to make the actual request.
 if (req.method === 'OPTIONS') {
  return new Response('ok', {
   headers: {
    // TODO: Replace '*' with your specific app URL in production for better security.
    'Access-Control-Allow-Origin': 'https://YOUR_APP_URL_HERE', // Or '*' for local dev if preferred
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
   },
  });
 }

 try {
  const { username, pin } = await req.json();

  // Validate the input
  // TODO: Replace '*' with your specific app URL in production for better security.
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://YOUR_APP_URL_HERE', // Or '*' for local dev
  };

  if (!username || !pin) {
   return new Response(JSON.stringify({ error: 'Username and PIN are required.' }), {
    status: 400,
    headers: corsHeaders,
   });
  }

  if (!UNIVERSAL_PIN) {
    console.error("APP_PIN environment variable is not set.");
    return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Check if the login credentials are correct
  if (VALID_USERS.includes(username.toLowerCase()) && pin === UNIVERSAL_PIN) {
   // Successful login
   return new Response(JSON.stringify({ message: `Welcome, ${username}!` }), {
    status: 200,
    headers: corsHeaders,
   });
  } else {
   // Invalid credentials
   return new Response(JSON.stringify({ error: 'Invalid username or PIN.' }), {
    status: 401,
    headers: corsHeaders,
   });
  }
 } catch (error) {
  return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
   status: 400,
   headers: corsHeaders,
  });
 }
});
