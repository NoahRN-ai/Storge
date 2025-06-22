import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient';

const ProfileModal = ({ user, onClose, onProfileUpdated }) => {
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (user) {
      // Fetch the latest profile data when the modal opens for this user
      const fetchProfile = async () => {
        setLoading(true);
        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('username, bio, status_message')
          .eq('id', user.id)
          .single();

        if (fetchError) {
          console.error('Error fetching profile:', fetchError);
          setError('Failed to load profile data.');
          setUsername(user.username || ''); // Fallback to initially passed username
          setBio('');
          setStatusMessage('');
        } else if (profile) {
          setUsername(profile.username || '');
          setBio(profile.bio || '');
          setStatusMessage(profile.status_message || '');
        }
        setLoading(false);
      };
      fetchProfile();
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    const updates = {
      username,
      bio,
      status_message: statusMessage,
      updated_at: new Date(),
    };

    const { data, error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select() // Select the updated data
      .single();

    setLoading(false);
    if (updateError) {
      console.error('Error updating profile:', updateError);
      setError(`Failed to update profile: ${updateError.message}`);
    } else {
      setSuccessMessage('Profile updated successfully!');
      if (onProfileUpdated) {
        onProfileUpdated(data); // Pass the updated profile back
      }
      setTimeout(() => {
        setSuccessMessage('');
        onClose(); // Optionally close modal on success after a delay
      }, 2000);
    }
  };

  if (!user) return null;

  return (
    <div className="profile-modal-overlay">
      <div className="profile-modal">
        <h2>Edit Profile</h2>
        {error && <p className="error-message">{error}</p>}
        {successMessage && <p className="success-message">{successMessage}</p>}
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username">Username:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="bio">Bio:</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself"
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="statusMessage">Status Message:</label>
            <input
              type="text"
              id="statusMessage"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="What's on your mind?"
              disabled={loading}
            />
          </div>
          <div className="modal-actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Profile'}
            </button>
            <button type="button" onClick={onClose} disabled={loading}>
              Close
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
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
          max-width: 400px;
        }
        .profile-modal h2 {
          margin-top: 0;
        }
        .profile-modal form div {
          margin-bottom: 15px;
        }
        .profile-modal label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        .profile-modal input[type="text"],
        .profile-modal textarea {
          width: calc(100% - 20px);
          padding: 8px 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .profile-modal textarea {
          min-height: 80px;
          resize: vertical;
        }
        .error-message {
          color: red;
          margin-bottom: 10px;
        }
        .success-message {
          color: green;
          margin-bottom: 10px;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }
      `}</style>
    </div>
  );
};

ProfileModal.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.string.isRequired,
    username: PropTypes.string, // Initial username, might be stale
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onProfileUpdated: PropTypes.func,
};

export default ProfileModal;
