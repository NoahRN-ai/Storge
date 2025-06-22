# Task List

## TODOs

- [ ] Replace vite.svg with a custom application favicon (storge/index.html:5)

## Backend Development

- [x] Database for users (store user profiles in a Supabase database table)
    - The `profiles` table, `handle_new_user` function, associated trigger, and RLS policies are now managed by Supabase migrations in the `supabase/migrations/` directory. This setup is applied automatically by the Supabase CLI (e.g., on `supabase start` or `supabase db reset`).

## Manual Testing

- [ ] Test user sign-up with a new email.
- [ ] Test user sign-in with correct credentials.
- [ ] Test user sign-in with incorrect credentials.
- [ ] Test password recovery flow.
- [ ] Test that a new user profile is created in the 'profiles' table after sign-up (and email confirmation, if enabled). This can be verified by checking the Supabase table directly or observing application behavior.
- [ ] Test that `online_status` is set to `true` upon login and `false` upon logout/browser close (Note: reliability of browser close detection will be improved in a subsequent step).

- [ ] Test message sending and receiving in real-time.
- [ ] Test behavior when Supabase connection is temporarily lost.
- [ ] Test UI responsiveness on different screen sizes.
- [ ] Verify that new messages scroll into view.
- [ ] Test logout functionality.
