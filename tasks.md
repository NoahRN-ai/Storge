# Task List

## TODOs

- [ ] Replace vite.svg with a custom application favicon (storge/index.html:5)

## Backend Development

- [ ] Database for users (store user profiles in a Supabase database table)
    - <!--
      Walkthrough for setting up the 'profiles' table and related logic:

      **Part 1: Run SQL to Create Table and Function (Agent-Provided SQL)**
      Use the Supabase SQL Editor (Dashboard > SQL Editor > New query) to run the following SQL.
      This creates the `profiles` table and a function to populate it.

      **Profiles Table SQL:**
      ```sql
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
      ```

      **Handle New User Function SQL:**
      ```sql
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public -- Ensures the function can find the 'profiles' table in the public schema
      AS $$
      BEGIN
        -- Attempts to use 'username' from metadata if passed during sign_up, otherwise sets it to null.
        -- raw_user_meta_data is a JSONB field, so we extract the text value.
        -- If you don't pass 'username' in user_metadata on sign_up, this will be NULL.
        -- You can also default it to something derived from email, e.g., split_part(NEW.email, '@', 1)
        INSERT INTO public.profiles (id, username)
        VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
        RETURN NEW;
      END;
      $$;
      ```

      **Part 2: Create the Database Trigger (Manual Step via Supabase Dashboard)**
      1. Go to your Supabase Project Dashboard.
      2. Navigate to "Database" -> "Triggers".
      3. Click "Create a new trigger".
      4. Fill in the details:
          - **Name:** `on_auth_user_created_create_profile` (or similar)
          - **Schema:** `auth`
          - **Table:** `users`
          - **Events:** Check `INSERT`.
          - **Trigger Type:** `AFTER`
          - **Orientation:** `FOR EACH ROW`
          - **Function:** Select `handle_new_user` from the `public` schema.
      5. Click "Confirm" to create the trigger.

      **Part 3: Set Up Row Level Security (RLS) for `profiles` Table (Manual Step via Supabase Dashboard)**
      1. Go to "Authentication" -> "Policies".
      2. In the schema dropdown, select `public`.
      3. Find and select the `profiles` table.
      4. If RLS is not enabled, click "Enable RLS".
      5. Create the following policies (or adapt them as needed). Click "Create a new policy" for each:

          - **Policy 1: Users can view their own profile.**
              - Policy Name: `Users can view their own profile`
              - Allowed operation: `SELECT`
              - Target roles: `authenticated`
              - USING expression: `auth.uid() = id`

          - **Policy 2: Users can update their own profile.**
              - Policy Name: `Users can update their own profile`
              - Allowed operation: `UPDATE`
              - Target roles: `authenticated`
              - USING expression (for who can update): `auth.uid() = id`
              - WITH CHECK expression (what can be updated): `auth.uid() = id` (prevents changing the `id`)

          - **Policy 3: Authenticated users can view all profiles (e.g., for chat display names).**
              - Policy Name: `Authenticated users can view all profiles`
              - Allowed operation: `SELECT`
              - Target roles: `authenticated`
              - USING expression: `true` (or `auth.role() = 'authenticated'`)
                (Note: `true` allows any authenticated user to read any profile. Adjust if more restrictive access is needed).

          - **Policy 4: Allow the `handle_new_user` function to insert profiles.**
            (This is implicitly handled by `SECURITY DEFINER` on the function if the function owner has insert rights.
            If you still face issues, you might need a specific INSERT policy for service roles or a more permissive one,
            but `SECURITY DEFINER` is the standard way for triggers.)
            A specific policy for inserts by the trigger function itself isn't usually needed if the function is `SECURITY DEFINER`
            and the function owner (usually `postgres`) has rights. The RLS for INSERTs on `profiles` would typically be:
            "Allow users to insert their own profile" (if they could call insert directly, which they usually don't for profiles created by trigger).
            The trigger bypasses RLS for the insert due to `SECURITY DEFINER`.

      **Part 4: Test Thoroughly (as per manual testing tasks below)**
      - Sign up new users.
      - Verify profiles are created in the Supabase table editor.
      - Verify `username` is populated if sent during signup (e.g., via `options: { data: { username: 'testuser' } }` in `supabase.auth.signUp`).
      - Verify app functionality (displaying usernames, online status).
      -->

## Manual Testing

- [ ] Test user sign-up with a new email.
- [ ] Test user sign-in with correct credentials.
- [ ] Test user sign-in with incorrect credentials.
- [ ] Test password recovery flow.
- [ ] Test that a new user profile is created in the 'profiles' table after sign-up and email confirmation (requires checking Supabase table).
- [ ] Test that `online_status` is set to `true` upon login and `false` upon logout/browser close.

- [ ] Test login functionality with various PINs (correct, incorrect, empty)
- [ ] Test message sending and receiving in real-time
- [ ] Test behavior when Supabase connection is temporarily lost
- [ ] Test UI responsiveness on different screen sizes
- [ ] Verify that new messages scroll into view
- [ ] Test logout functionality (if applicable after auth changes)
