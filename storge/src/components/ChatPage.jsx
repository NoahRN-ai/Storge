import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient';

const ChatPage = ({ userProfile, onLogout }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState({}); // Stores { userId: { username, online_at } }
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  const CHAT_CHANNEL_NAME = 'storge-chat'; // Renamed for clarity, can be anything unique
  const TYPING_EVENT_NAME = 'typing'; // Keep this simple for broadcast

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          text,
          created_at,
          profile_id,
          profiles ( username )
        `) // online_status from profiles table is less reliable for active chat
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        setMessages([]);
      } else {
        setMessages(data);
      }
      setLoading(false);
    };

    fetchMessages();

    // Realtime subscription for new messages
    const messagesSubscription = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          let newMessage = payload.new;
          if (newMessage.profile_id && !newMessage.profiles) {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', newMessage.profile_id)
              .single();
            if (profileError) {
              console.error('Error fetching profile for new message:', profileError);
              newMessage.profiles = { username: 'Unknown' };
            } else {
              newMessage.profiles = profileData;
            }
          }
          setMessages((currentMessages) => [...currentMessages, newMessage]);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to messages DB changes!');
        } else if (err) {
          console.error('Messages DB subscription error:', err);
        }
      });

    // Chat channel for presence and typing indicators
    let chatChannel;
    if (userProfile?.id) {
      chatChannel = supabase.channel(CHAT_CHANNEL_NAME, {
        config: {
          presence: {
            key: userProfile.id, // Unique key for this user in presence state
          },
          broadcast: {
            self: false, // Don't receive our own typing events
          },
        },
      });

      chatChannel
        .on('presence', { event: 'sync' }, () => {
          const presenceState = chatChannel.presenceState();
          const currentOnlineUsers = {};
          for (const key in presenceState) {
            const presences = presenceState[key];
            if (presences.length > 0) {
              // Assuming the payload from track() includes username
              currentOnlineUsers[key] = {
                username: presences[0].username || 'User', // Fallback username
                online_at: presences[0].online_at
              };
            }
          }
          setOnlineUsers(currentOnlineUsers);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          if (newPresences.length > 0) {
            setOnlineUsers(prev => ({ ...prev, [key]: {
              username: newPresences[0].username || 'User',
              online_at: newPresences[0].online_at
            } }));
          }
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          setOnlineUsers(prev => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
          });
        })
        .on('broadcast', { event: TYPING_EVENT_NAME }, (payload) => {
          const { userId, username, isTyping } = payload.payload;
          if (isTyping) {
            setTypingUsers((prev) => ({ ...prev, [userId]: username }));
          } else {
            setTypingUsers((prev) => {
              const newTypingUsers = { ...prev };
              delete newTypingUsers[userId];
              return newTypingUsers;
            });
          }
        })
        .subscribe(async (status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log(`Subscribed to ${CHAT_CHANNEL_NAME} channel`);
            await chatChannel.track({
              user_id: userProfile.id,
              username: userProfile.username,
              online_at: new Date().toISOString()
            });
          } else if (err) {
            console.error(`${CHAT_CHANNEL_NAME} channel error:`, err);
          }
        });
    }

    return () => {
      supabase.removeChannel(messagesSubscription);
      if (chatChannel) {
        chatChannel.untrack(); // Important to untrack on unmount/logout
        supabase.removeChannel(chatChannel);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [userProfile]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendTypingEvent = async (isTyping) => {
    if (!userProfile || !supabase.channel(CHAT_CHANNEL_NAME)) return;

    try {
      await supabase.channel(CHAT_CHANNEL_NAME).send({
        type: 'broadcast',
        event: TYPING_EVENT_NAME,
        payload: { userId: userProfile.id, username: userProfile.username, isTyping },
      });
    } catch (error) {
      console.error(`Error sending typing event (isTyping: ${isTyping}):`, error);
    }
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    } else {
      sendTypingEvent(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingEvent(false);
      typingTimeoutRef.current = null;
    }, 1500);
  };

  const handleInputKeyDown = (e) => {
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

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    await sendTypingEvent(false);

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

  if (loading && !messages.length) {
    return <div>Loading chat...</div>;
  }

  const currentUserProfileId = userProfile?.id;
  const isUserOnline = (userId) => !!onlineUsers[userId];

  return (
    <div className="chat-page">
      <header className="chat-header">
        <h1>Storge Chat</h1>
        {userProfile && (
          <span className="user-display">
            Welcome, {userProfile.username}
            <span
              title={isUserOnline(userProfile.id) ? 'Online' : 'Offline (Connecting...)'}
              className={`status-indicator ${isUserOnline(userProfile.id) ? 'online' : 'offline'}`}
            ></span>
          </span>
        )}
        <button onClick={onLogout} className="logout-button">Logout</button>
      </header>
      <div className="messages-list">
        {messages.map((msg) => {
          const isSentByCurrentUser = msg.profile_id === currentUserProfileId;
          const authorUsername = msg.profiles?.username || (isSentByCurrentUser ? userProfile.username : 'Unknown User');
          // Use onlineUsers state for author's online status if available
          const authorIsOnline = isUserOnline(msg.profile_id);

          return (
            <div
              key={msg.id}
              className={`message-item ${isSentByCurrentUser ? 'sent' : 'received'}`}
            >
              {!isSentByCurrentUser && (
                <div className="message-author">
                  {authorUsername}
                  <span
                    title={authorIsOnline ? 'Online' : 'Offline'}
                    className={`status-indicator ${authorIsOnline ? 'online' : 'offline'}`}
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
          onKeyDown={handleInputKeyDown}
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
       {/* Optional: Display list of online users for debugging or feature */}
       {/* <div style={{ fontSize: '0.8em', marginTop: '10px', textAlign: 'left' }}>
          Online: {Object.values(onlineUsers).map(u => u.username).join(', ') || 'None'}
       </div> */}
    </div>
  );
};

ChatPage.propTypes = {
  userProfile: PropTypes.shape({
    id: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    // online_status: PropTypes.bool, // This is now primarily handled by presence
  }).isRequired,
  onLogout: PropTypes.func.isRequired,
};

export default ChatPage;
