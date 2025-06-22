import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient';

// Assuming you have a profiles table with id (UUID, PK) and username (text)
// And your messages table has a profile_id (UUID, FK to profiles.id)

const ChatPage = ({ userProfile, onLogout }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({}); // Stores { userId: username }
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  const TYPING_CHANNEL_NAME = 'typing-events';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      // Fetch messages and join with profiles table to get username
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          text,
          created_at,
          profile_id,
          profiles ( username, online_status )
        `) // Joins with profiles table, fetch online_status
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        setMessages([]); // Set to empty array on error
      } else {
        setMessages(data);
      }
      setLoading(false);
    };

    fetchMessages();

    // Realtime subscription for new messages
    const messagesChannel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          let newMessage = payload.new;
          if (newMessage.profile_id && !newMessage.profiles) { // Check if profile data needs fetching
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('username, online_status') // Fetch online_status here too
              .eq('id', newMessage.profile_id)
              .single();
            if (profileError) {
              console.error('Error fetching profile for new message:', profileError);
              // Add a placeholder if profile fetch fails for some reason
              newMessage.profiles = { username: 'Unknown', online_status: false };
            } else {
              newMessage.profiles = profileData;
            }
          }
          setMessages((currentMessages) => [...currentMessages, newMessage]);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to messages channel!');
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('Messages channel error:', err);
        }
        if (status === 'TIMED_OUT') {
          console.error('Messages channel timed out');
        }
      });

    // Realtime subscription for profile updates (e.g., online status)
    // This will help update online status indicators in real-time without refetching all messages
    const profileChangesChannel = supabase
      .channel('public:profiles')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          setMessages((currentMessages) =>
            currentMessages.map((msg) => {
              if (msg.profile_id === payload.new.id) {
                return {
                  ...msg,
                  profiles: { ...msg.profiles, ...payload.new },
                };
              }
              return msg;
            })
          );
          // Also update the current userProfile if it matches
          if (userProfile && userProfile.id === payload.new.id) {
            // This update should ideally be handled in App.jsx and propagated down
            // For now, this keeps ChatPage's view of userProfile consistent if it's the one updated
            // Consider if this direct update here is desired or if App.jsx should be the sole source of userProfile truth
            // For simplicity here, we'll allow it to refresh the local data used for message display.
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to profiles channel!');
        }
         if (status === 'CHANNEL_ERROR') {
          console.error('Profiles channel error:', err);
        }
      });


    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(profileChangesChannel);
      if (typingChannel) {
        supabase.removeChannel(typingChannel);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [userProfile]); // Added userProfile to re-evaluate if needed, though subscriptions are fairly stable

  // Typing indicator logic
  useEffect(() => {
    if (!userProfile?.id) return;

    const typingChannel = supabase.channel(TYPING_CHANNEL_NAME, {
      config: {
        broadcast: {
          self: false, // Don't receive our own typing events
        },
      },
    });

    typingChannel
      .on('broadcast', { event: 'typing_started' }, (payload) => {
        // console.log('Typing started event received:', payload);
        if (payload.payload?.userId && payload.payload?.username) {
          setTypingUsers((prev) => ({
            ...prev,
            [payload.payload.userId]: payload.payload.username,
          }));
        }
      })
      .on('broadcast', { event: 'typing_stopped' }, (payload) => {
        // console.log('Typing stopped event received:', payload);
        if (payload.payload?.userId) {
          setTypingUsers((prev) => {
            const newTypingUsers = { ...prev };
            delete newTypingUsers[payload.payload.userId];
            return newTypingUsers;
          });
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          // console.log(`Subscribed to ${TYPING_CHANNEL_NAME} channel`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`${TYPING_CHANNEL_NAME} channel error:`, err);
        }
      });

    return () => {
      if (typingChannel) {
        // console.log(`Unsubscribing from ${TYPING_CHANNEL_NAME}`);
        supabase.removeChannel(typingChannel);
      }
    };
  }, [userProfile?.id]); // Re-subscribe if userProfile.id changes (e.g. login/logout)


  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendTypingEvent = async (isTyping) => {
    if (!userProfile || !supabase.channel(TYPING_CHANNEL_NAME)) return;

    const eventName = isTyping ? 'typing_started' : 'typing_stopped';
    try {
      // console.log(`Sending ${eventName} for ${userProfile.username}`);
      await supabase.channel(TYPING_CHANNEL_NAME).send({
        type: 'broadcast',
        event: eventName,
        payload: { userId: userProfile.id, username: userProfile.username },
      });
    } catch (error) {
      console.error(`Error sending ${eventName} event:`, error);
    }
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    } else {
      // Only send typing_started if not already considered typing (i.e., no timeout was pending)
      sendTypingEvent(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingEvent(false);
      typingTimeoutRef.current = null; // Clear the ref after timeout executes
    }, 1500); // User considered "stopped typing" after 1.5 seconds of inactivity
  };

  const handleInputKeyDown = (e) => {
    // Optional: if Enter is pressed to send message, immediately send typing_stopped
    if (e.key === 'Enter' && message.trim() !== '') {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      sendTypingEvent(false);
    }
  };


  const handleSendMessage = async (event) => {
    event.preventDefault();
    const messageText = message.trim();
    if (messageText === '' || !userProfile) return;

    // Stop typing event before sending message
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    await sendTypingEvent(false); // Ensure typing stopped is sent

    const { error } = await supabase
      .from('messages')
      .insert({ text: messageText, profile_id: userProfile.id });

    if (error) {
      console.error('Error sending message:', error);
    } else {
      setMessage('');
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading && !messages.length) { // Show loading only if no messages are displayed yet
    return <div>Loading chat...</div>;
  }

  const currentUserProfileId = userProfile?.id;

  return (
    <div className="chat-page">
      <header className="chat-header">
        <h1>Storge Chat</h1>
        {userProfile && (
          <span className="user-display">
            Welcome, {userProfile.username}
            <span
              title={userProfile.online_status ? 'Online' : 'Offline'}
              className={`status-indicator ${userProfile.online_status ? 'online' : 'offline'}`}
            ></span>
          </span>
        )}
        <button onClick={onLogout} className="logout-button">Logout</button>
      </header>
      <div className="messages-list">
        {messages.map((msg) => {
          const isSentByCurrentUser = msg.profile_id === currentUserProfileId;
          const authorUsername = msg.profiles?.username || (isSentByCurrentUser ? userProfile.username : 'Unknown User');
          const authorOnlineStatus = msg.profiles?.online_status || false;

          return (
            <div
              key={msg.id}
              className={`message-item ${isSentByCurrentUser ? 'sent' : 'received'}`}
            >
              {!isSentByCurrentUser && (
                <div className="message-author">
                  {authorUsername}
                  <span
                    title={authorOnlineStatus ? 'Online' : 'Offline'}
                    className={`status-indicator ${authorOnlineStatus ? 'online' : 'offline'}`}
                  ></span>
                </div>
              )}
              <div className="message-bubble">{msg.text}</div>
              <div className="message-timestamp">
                {formatTimestamp(msg.created_at)}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form className="message-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="message-input"
          placeholder="Type your message..."
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown} // Optional: send typing_stopped on Enter before message sends
          disabled={!userProfile}
        />
        <button type="submit" disabled={!userProfile || message.trim() === ''}>Send</button>
      </form>
      <div className="typing-indicator-container">
        {Object.values(typingUsers).length > 0 && (
          <p>
            {Object.values(typingUsers).join(', ')}
            {Object.values(typingUsers).length === 1 ? ' is typing...' : ' are typing...'}
          </p>
        )}
      </div>
    </div>
  );
};

ChatPage.propTypes = {
  userProfile: PropTypes.shape({
    id: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    online_status: PropTypes.bool,
  }).isRequired,
  onLogout: PropTypes.func.isRequired,
};

export default ChatPage;
