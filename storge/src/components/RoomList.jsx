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
    <div className="profile-modal-overlay"> {/* Reusing profile modal style for overlay */}
      <div className="profile-modal" style={{maxWidth: '350px'}}> {/* Reusing profile modal style */}
        <h2>Create New Group</h2>
        {error && <p className="error-message" style={{color: 'red'}}>{error}</p>}
        <div>
          <label htmlFor="roomName">Group Name:</label>
          <input
            type="text"
            id="roomName"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="modal-actions" style={{marginTop: '15px'}}>
          <button onClick={handleCreateRoom} disabled={loading}>
            {loading ? 'Creating...' : 'Create Group'}
          </button>
          <button type="button" onClick={onClose} disabled={loading}>
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
          className="new-group-button"
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
      <style jsx>{`
        .room-list-container {
          width: 250px;
          border-right: 1px solid #eee;
          padding: 10px;
          display: flex;
          flex-direction: column;
          background-color: #f9f9f9;
        }
        .room-list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .room-list-header h3 {
          margin: 0;
        }
        .new-group-button {
          padding: 5px 8px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .new-group-button:hover {
          background-color: #0056b3;
        }
        .room-list {
          list-style: none;
          padding: 0;
          margin: 0;
          overflow-y: auto;
        }
        .room-list-item {
          padding: 10px;
          cursor: pointer;
          border-bottom: 1px solid #eee;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .room-list-item:hover {
          background-color: #e9e9e9;
        }
        .room-list-item.active {
          background-color: #007bff;
          color: white;
          font-weight: bold;
        }
        .no-rooms-message {
          text-align: center;
          color: #777;
          margin-top: 20px;
        }
        /* Reusing some styles from ProfileModal for consistency */
        .profile-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .profile-modal {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          width: 90%;
        }
        .profile-modal label {
          display: block;
          margin-bottom: 5px;
        }
        .profile-modal input[type="text"]{
          width: calc(100% - 22px); /* Account for padding and border */
          padding: 8px 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          margin-bottom: 10px;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
      `}</style>
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
