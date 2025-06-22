-- Create the profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  online_status BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Stores public user profile information.';
COMMENT ON COLUMN public.profiles.id IS 'References the internal Supabase auth user id.';
COMMENT ON COLUMN public.profiles.username IS 'User-chosen display name, must be unique.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'URL to the user''s avatar image.';
COMMENT ON COLUMN public.profiles.online_status IS 'Indicates if the user is currently considered online.';
COMMENT ON COLUMN public.profiles.updated_at IS 'Timestamp of the last profile update.';

-- Create the function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$;

-- Create the trigger to call the function on new user insertion
CREATE TRIGGER on_auth_user_created_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security for the profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- It's good practice to ensure the postgres user (owner of the function) can bypass RLS
-- or that the function itself operates as expected.
-- The SECURITY DEFINER clause on the function means it runs with the permissions of the user who defined it (usually postgres),
-- which typically has rights to insert into tables it owns or has privileges on, bypassing RLS for that specific operation.
-- No explicit INSERT policy is strictly needed for the trigger if SECURITY DEFINER is used correctly.
-- However, if direct inserts by users were allowed (they are not in this app's flow for profiles),
-- an INSERT policy would be required for them.
-- For clarity and completeness, we can ensure `postgres` (or the function owner) is not unduly restricted if we wanted to be overly cautious,
-- but standard practice relies on SECURITY DEFINER.
-- Example of allowing all for postgres user (usually default and not strictly needed for SECURITY DEFINER functions):
-- CREATE POLICY "Allow all for postgres user" ON public.profiles FOR ALL
-- USING (current_user = 'postgres')
-- WITH CHECK (current_user = 'postgres');
-- This is generally not required for the trigger to function.
-- The policies above are standard for user profile tables.
