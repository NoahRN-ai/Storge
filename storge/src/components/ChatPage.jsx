import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient';
import ProfileModal from './ProfileModal'; // Import the ProfileModal component

const ChatPage = ({ userProfile, onLogout, onProfileUpdate, currentRoomId }) => { // Added currentRoomId
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsersInRoom, setOnlineUsersInRoom] = useState({}); // Renamed and room-specific
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Dynamic channel names based on currentRoomId
  const roomSpecificChannelName = currentRoomId ? `room-channel-${currentRoomId}` : null;
  const TYPING_EVENT_NAME = 'typing';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!currentRoomId || !userProfile?.id) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessages([]); // Clear messages when room changes
    setTypingUsers({});
    setOnlineUsersInRoom({});

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, text, created_at, profile_id, profiles ( username )')
        .eq('room_id', currentRoomId) // Filter by room_id
        .order('created_at', { ascending: true });

      if (error) {
        console.error(`Error fetching messages for room ${currentRoomId}:`, error);
        setMessages([]);
      } else {
        setMessages(data || []);
      }
      setLoading(false);
    };

    fetchMessages();

    // Realtime subscription for new messages in the current room
    const messagesSubscription = supabase
      .channel(`public:messages:room_id=eq.${currentRoomId}`) // More specific channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoomId}` },
        async (payload) => {
          let newMessage = payload.new;
          // Ensure message belongs to the current room (double check, though filter should handle)
          if (newMessage.room_id !== currentRoomId) return;

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
          console.log(`Subscribed to messages in room ${currentRoomId}`);
        } else if (err) {
          console.error(`Messages DB subscription error for room ${currentRoomId}:`, err);
        }
      });

    // Room-specific channel for presence and typing indicators
    let roomChannelInstance;
    if (roomSpecificChannelName) {
      roomChannelInstance = supabase.channel(roomSpecificChannelName, {
        config: {
          presence: { key: userProfile.id },
          broadcast: { self: false },
        },
      });

      roomChannelInstance
        .on('presence', { event: 'sync' }, () => {
          const presenceState = roomChannelInstance.presenceState();
          const currentOnlineUsers = {};
          for (const key in presenceState) {
            const presences = presenceState[key];
            if (presences.length > 0) {
              currentOnlineUsers[key] = {
                username: presences[0].username || 'User',
                online_at: presences[0].online_at,
              };
            }
          }
          setOnlineUsersInRoom(currentOnlineUsers);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          if (newPresences.length > 0) {
            setOnlineUsersInRoom(prev => ({ ...prev, [key]: {
              username: newPresences[0].username || 'User',
              online_at: newPresences[0].online_at,
            }}));
          }
        })
        .on('presence', { event: 'leave' }, ({ key /*, leftPresences */ }) => {
          setOnlineUsersInRoom(prev => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
          });
        })
        .on('broadcast', { event: TYPING_EVENT_NAME }, (payload) => {
          // Ensure typing event is for the current user and not self if not filtered by broadcast.self
          if (payload.payload?.userId === userProfile.id && !roomChannelInstance.broadcast.self) return;

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
            console.log(`Subscribed to room channel ${roomSpecificChannelName}`);
            await roomChannelInstance.track({
              username: userProfile.username, // Pass username for presence
              online_at: new Date().toISOString(),
            });
          } else if (err) {
            console.error(`Room channel ${roomSpecificChannelName} error:`, err);
          }
        });
    }

    return () => {
      supabase.removeChannel(messagesSubscription);
      if (roomChannelInstance) {
        roomChannelInstance.untrack();
        supabase.removeChannel(roomChannelInstance);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [currentRoomId, userProfile?.id, userProfile?.username]); // Added userProfile.username for track

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendTypingEvent = async (isTyping) => {
    if (!userProfile || !roomSpecificChannelName) return;
    const channel = supabase.channel(roomSpecificChannelName);
    if (!channel) return;

    try {
      await channel.send({
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
    if (messageText === '' || !userProfile || !currentRoomId) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    await sendTypingEvent(false);

    const { error } = await supabase
      .from('messages')
      .insert({
        text: messageText,
        profile_id: userProfile.id,
        room_id: currentRoomId, // Add room_id to the message
      });

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
    return <div>Loading chat for room...</div>;
  }

  const currentUserProfileId = userProfile?.id;
  // Use onlineUsersInRoom for checking status
  const isUserOnlineInRoom = (userId) => !!onlineUsersInRoom[userId];


  // Attempt to get room name (assuming rooms are passed down or fetched, this is a placeholder)
  // For a proper implementation, ChatPage might need access to the current room object, not just ID.
  // Or, App.jsx could pass the room's name. For now, just use ID.
  const roomDisplayName = `Room: ${currentRoomId ? currentRoomId.substring(0, 8) + "..." : "N/A"}`;


  return (
    <div className="chat-page">
      <header className="chat-header">
        <h1>{roomDisplayName}</h1> {/* Display room name/ID */}
        {userProfile && (
          <span className="user-display">
            {userProfile.username}
            <span
              title={isUserOnlineInRoom(userProfile.id) ? 'Online in this room' : 'Offline in this room (or connecting...)'}
              className={`status-indicator ${isUserOnlineInRoom(userProfile.id) ? 'online' : 'offline'}`}
            ></span>
          </span>
        )}
        <button onClick={() => setIsProfileModalOpen(true)} className="profile-button">Profile</button>
        <button onClick={onLogout} className="logout-button">Logout</button>
      </header>
      {isProfileModalOpen && userProfile && (
        <ProfileModal
          user={userProfile}
          onClose={() => setIsProfileModalOpen(false)}
          onProfileUpdated={(updatedProfile) => {
            // Optionally update local state if needed, or rely on App.jsx re-fetch
            if (onProfileUpdate) {
              onProfileUpdate(updatedProfile);
            }
            setIsProfileModalOpen(false); // Close modal after update
          }}
        />
      )}
      <div className="messages-list">
        {messages.map((msg) => {
          const isSentByCurrentUser = msg.profile_id === currentUserProfileId;
          const authorUsername = msg.profiles?.username || (isSentByCurrentUser ? userProfile.username : 'Unknown User');
          // Use onlineUsersInRoom state for author's online status if available
          const authorIsOnline = isUserOnlineInRoom(msg.profile_id);

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
    bio: PropTypes.string, // Added bio
    status_message: PropTypes.string, // Added status_message
    // online_status: PropTypes.bool, // This is now primarily handled by presence
  }).isRequired,
  onLogout: PropTypes.func.isRequired,
  onProfileUpdate: PropTypes.func,
  currentRoomId: PropTypes.string, // Can be null if no room is selected
};

export default ChatPage;
