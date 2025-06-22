-- Add bio and status_message columns to the profiles table
ALTER TABLE public.profiles
ADD COLUMN bio TEXT,
ADD COLUMN status_message TEXT;

COMMENT ON COLUMN public.profiles.bio IS 'User''s biography or short description.';
COMMENT ON COLUMN public.profiles.status_message IS 'User''s current status message.';
