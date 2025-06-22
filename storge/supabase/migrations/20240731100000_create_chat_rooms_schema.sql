-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create the 'rooms' table
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  name TEXT, -- Name of the room, primarily for group chats
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')), -- Type of the room: 'direct' or 'group'
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- User who created the room (especially for groups)
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.rooms IS 'Stores chat rooms or conversations.';
COMMENT ON COLUMN public.rooms.name IS 'Display name for group rooms.';
COMMENT ON COLUMN public.rooms.type IS 'Type of the room: ''direct'' for 1-on-1, ''group'' for multi-user.';
COMMENT ON COLUMN public.rooms.created_by IS 'The user who initiated the room, if applicable.';
COMMENT ON COLUMN public.rooms.updated_at IS 'Timestamp of the last activity or update in the room.';


-- 2. Create the 'room_participants' table
CREATE TABLE public.room_participants (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (room_id, profile_id) -- Composite primary key
);

COMMENT ON TABLE public.room_participants IS 'Associates users (profiles) with rooms they are part of.';


-- 3. Modify the 'messages' table to include 'room_id'
-- First, drop the existing foreign key constraint on profile_id if it references auth.users directly
-- and not public.profiles. Assuming it's already public.profiles as per ChatPage.jsx
-- ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_profile_id_fkey;

-- Add the room_id column. It will be nullable initially to handle existing messages,
-- though ideally, existing messages would be migrated or associated with a default room if necessary.
-- For a new system, we can make it NOT NULL after initial setup or if no prior messages exist.
ALTER TABLE public.messages
ADD COLUMN room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE;

-- After adding, if you intend for all messages to belong to a room:
-- UPDATE public.messages SET room_id = 'your_default_or_migrated_room_id' WHERE room_id IS NULL;
-- ALTER TABLE public.messages ALTER COLUMN room_id SET NOT NULL;
-- For now, leaving it nullable to avoid breaking existing data that doesn't have rooms.
-- However, new messages should always have a room_id.

COMMENT ON COLUMN public.messages.room_id IS 'The room to which this message belongs.';


-- RLS Policies for new tables

-- Rooms RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see rooms they are a participant in"
  ON public.rooms FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.room_participants
      WHERE room_participants.room_id = rooms.id
      AND room_participants.profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can create rooms"
  ON public.rooms FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL); -- Any authenticated user can create a room.
                                      -- The `created_by` field should be set to auth.uid() by the app.
                                      -- Additional checks for 'direct' rooms (e.g., only 2 participants) will be app logic.

CREATE POLICY "Room creators can update room details (e.g., name for groups)"
  ON public.rooms FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);


-- Room Participants RLS
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own participation record"
  ON public.room_participants FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can be added to rooms (by app logic, e.g. creator adding others, or joining open groups)"
  ON public.room_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL); -- Simplistic: allows users to add themselves or be added.
                                     -- More specific logic (e.g. only room admin can add) might need a function.

CREATE POLICY "Users can leave rooms (delete their own participation)"
  ON public.room_participants FOR DELETE
  USING (auth.uid() = profile_id);


-- Messages RLS (Update existing policies if necessary, or add new ones)
-- Assuming 'messages' table already has RLS enabled.
-- The existing policy "Authenticated users can view all messages" might be too broad now.
-- It should be restricted to messages in rooms they are part of.

DROP POLICY IF EXISTS "Authenticated users can view all messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles; --This was a typo in the original, should be on messages or a more specific policy.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles; --Typo
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages; -- Example, if such existed


CREATE POLICY "Users can view messages in rooms they are part of"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.room_participants
      WHERE room_participants.room_id = messages.room_id
      AND room_participants.profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages into rooms they are part of"
  ON public.messages FOR INSERT
  WITH CHECK (
    profile_id = auth.uid() AND -- User can only send messages as themselves
    EXISTS (
      SELECT 1
      FROM public.room_participants
      WHERE room_participants.room_id = messages.room_id
      AND room_participants.profile_id = auth.uid()
    )
  );

-- Assuming users cannot delete or update messages for now, or those policies are specific.
-- If there was an "Users can update their own messages" policy, it should also check room participation.

-- Trigger to update room's updated_at when a new message is sent
CREATE OR REPLACE FUNCTION public.update_room_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.rooms
  SET updated_at = NOW()
  WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_message_update_room_timestamp
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_room_updated_at();

-- Trigger to add creator to room_participants when a room is created
CREATE OR REPLACE FUNCTION public.add_creator_to_room_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Important for inserting into room_participants
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.room_participants (room_id, profile_id)
    VALUES (NEW.id, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_room_created_add_creator_as_participant
  AFTER INSERT ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_to_room_participants();
