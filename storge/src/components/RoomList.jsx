import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient'; // Needed for creating rooms

// Simple modal for creating a new group room
const CreateGroupRoomModal = ({ currentUserId, onClose, onRoomCreated }) => {
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('Room name cannot be empty.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // 1. Create the room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: roomName,
          type: 'group',
          created_by: currentUserId,
        })
        .select()
        .single();

      if (roomError) {
        throw roomError;
      }

      // 2. The trigger 'on_room_created_add_creator_as_participant' should automatically add the creator.
      // If we needed to add other participants here, we would do it.

      setLoading(false);
      onRoomCreated(room); // Pass the new room object
      onClose();
    } catch (err) {
      console.error('Error creating room:', err);
      setError(`Failed to create room: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    // Use generic modal classes from index.css
    <div className="modal-overlay">
      <div className="modal-content create-room-modal-specific-styles"> {/* Add specific class if needed */}
        <h2>Create New Group</h2>
        {error && <p className="error-message">{error}</p>}
        <div className="form-group">
          <label htmlFor="roomName">Group Name:</label>
          <input
            type="text"
            id="roomName"
            className="form-input"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="modal-actions">
          <button onClick={handleCreateRoom} disabled={loading} className="button button-primary">
            {loading ? 'Creating...' : 'Create Group'}
          </button>
          <button type="button" onClick={onClose} disabled={loading} className="button button-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

CreateGroupRoomModal.propTypes = {
  currentUserId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onRoomCreated: PropTypes.func.isRequired,
};


const RoomList = ({ rooms, currentRoomId, onSelectRoom, onCreateRoom, currentUserId }) => {
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

  const getRoomDisplayName = (room) => {
    if (room.type === 'group') {
      return room.name || 'Unnamed Group';
    }
    // For 'direct' messages, a more complex name generation might be needed
    // e.g., finding the other participant's name. For now, just use ID or generic.
    // This part will be improved later when direct messaging is fully implemented.
    return room.name || `Chat ${room.id.substring(0, 4)}`;
  };

  const handleNewRoomCreated = (newRoom) => {
    onCreateRoom(newRoom); // This should trigger a refresh in App.jsx
    // Optionally, auto-select the new room
    // onSelectRoom(newRoom.id);
  };

  return (
    <div className="room-list-container">
      <div className="room-list-header">
        <h3>Conversations</h3>
        <button
          onClick={() => setShowCreateGroupModal(true)}
          className="button new-group-button" // Use general button class + specific
          title="Create new group chat"
        >
          + Group
        </button>
      </div>
      {rooms.length === 0 && <p className="no-rooms-message">No conversations yet.</p>}
      <ul className="room-list">
        {rooms.map((room) => (
          <li
            key={room.id}
            className={`room-list-item ${room.id === currentRoomId ? 'active' : ''}`}
            onClick={() => onSelectRoom(room.id)}
          >
            {getRoomDisplayName(room)}
          </li>
        ))}
      </ul>
      {showCreateGroupModal && (
        <CreateGroupRoomModal
          currentUserId={currentUserId}
          onClose={() => setShowCreateGroupModal(false)}
          onRoomCreated={handleNewRoomCreated}
        />
      )}
      {/* <style jsx>{` ... `}</style> Removed inline styles, will move to index.css */}
    </div>
  );
};

RoomList.propTypes = {
  rooms: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    type: PropTypes.string.isRequired,
    updated_at: PropTypes.string,
  })).isRequired,
  currentRoomId: PropTypes.string,
  onSelectRoom: PropTypes.func.isRequired,
  onCreateRoom: PropTypes.func.isRequired, // This is more like onRefreshRoomsNeeded
  currentUserId: PropTypes.string.isRequired,
};

export default RoomList;
