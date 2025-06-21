import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient';

const ChatPage = ({ user, onLogout }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) console.error('Error fetching messages:', error);
      else setMessages(data);
      setLoading(false);
    };

    fetchMessages();

    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((currentMessages) => [...currentMessages, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const messageText = message.trim();
    if (messageText === '') return;

    const { error } = await supabase
      .from('messages')
      .insert({ text: messageText, author: user });

    if (error) console.error('Error sending message:', error);
    else setMessage('');
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return <div>Loading chat...</div>;
  }

  return (
    <div className="chat-page">
      <button onClick={onLogout} className="logout-button">Logout</button>
      <h1>Storge Chat</h1>
      <div className="messages-list">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message-item ${msg.author === user ? 'sent' : 'received'}`}
          >
            <div className="message-author">{msg.author}</div>
            <div className="message-bubble">{msg.text}</div>
            <div className="message-timestamp">
              {formatTimestamp(msg.created_at)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="message-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="message-input"
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

ChatPage.propTypes = {
  user: PropTypes.string.isRequired,
  onLogout: PropTypes.func.isRequired,
};

export default ChatPage;
