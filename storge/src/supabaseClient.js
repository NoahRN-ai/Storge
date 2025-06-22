import { createClient } from '@supabase/supabase-js'

// Load Supabase URL and Anon Key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is missing. Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.");
  // You could throw an error here or handle it gracefully depending on the application's needs
  // For now, we'll allow the client to be created, but it will likely fail to connect.
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
