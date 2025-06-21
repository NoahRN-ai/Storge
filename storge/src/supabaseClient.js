import { createClient } from '@supabase/supabase-js'

// IMPORTANT: The user must replace these placeholders with their own Supabase URL and Anon Key.
const supabaseUrl = 'https://ymgoogzzuwwnomlszcpu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ29vZ3p6dXd3bm9tbHN6Y3B1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA1Mjc2NjMsImV4cCI6MjA2NjEwMzY2M30.ccAsehPFMbXFQGXW3YLtPbKgutPKL_S2ITktogKWXqk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
