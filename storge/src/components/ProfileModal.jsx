import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabaseClient';

const ProfileModal = ({ user, onClose, onProfileUpdated }) => {
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [avatarFile, setAvatarFile] = useState(null); // For storing the selected file
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null); // To store existing avatar_url for display/info

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        setLoading(true);
        setError(''); // Clear previous errors
        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('username, bio, status_message, avatar_url') // Fetch avatar_url
          .eq('id', user.id)
          .single();

        if (fetchError) {
          console.error('Error fetching profile:', fetchError);
          setError('Failed to load profile data.');
          setUsername(user.username || '');
          setBio('');
          setStatusMessage('');
          setAvatarUrl(null);
        } else if (profile) {
          setUsername(profile.username || '');
          setBio(profile.bio || '');
          setStatusMessage(profile.status_message || '');
          setAvatarUrl(profile.avatar_url || null); // Store existing avatar URL
        }
        setLoading(false);
      };
      fetchProfile();
    }
  }, [user]);

  const handleAvatarChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Minimal client-side validation (type and size)
      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        setError('Invalid file type. Please select a PNG, JPEG, or GIF.');
        setAvatarFile(null);
        return;
      }
      const maxSizeInMB = 2;
      if (file.size > maxSizeInMB * 1024 * 1024) {
        setError(`File is too large. Maximum size is ${maxSizeInMB}MB.`);
        setAvatarFile(null);
        return;
      }
      setError(''); // Clear previous errors
      setAvatarFile(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    let newAvatarUrl = avatarUrl; // Keep existing URL if no new file

    if (avatarFile) {
      const filePath = `${user.id}/${avatarFile.name}`; // Consider a more unique name or standard name like 'avatar.png'
      const { error: uploadError } = await supabase.storage
        .from('avatars') // Ensure this bucket name matches your Supabase setup
        .upload(filePath, avatarFile, {
          cacheControl: '3600',
          upsert: true, // Overwrite if file already exists
        });

      if (uploadError) {
        console.error('Error uploading avatar:', uploadError);
        setError(`Failed to upload avatar: ${uploadError.message}`);
        setLoading(false);
        return;
      }
      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      newAvatarUrl = publicUrlData ? publicUrlData.publicUrl : null;
       if (!newAvatarUrl) {
         console.error('Could not get public URL for avatar.');
         // setError('Failed to get avatar URL. Profile text updated, but avatar might not show.');
         // Decide if to proceed or hard error. For now, we'll proceed with text updates.
       }
    }

    const updates = {
      username,
      bio,
      status_message: statusMessage,
      avatar_url: newAvatarUrl, // Include new or existing avatar_url
      updated_at: new Date(),
    };

    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    setLoading(false);
    if (updateError) {
      console.error('Error updating profile:', updateError);
      setError(`Failed to update profile text: ${updateError.message}`);
    } else {
      setSuccessMessage('Profile updated successfully!');
      setAvatarFile(null); // Clear the file input state
      if (updatedProfile) setAvatarUrl(updatedProfile.avatar_url); // Update displayed avatar URL

      if (onProfileUpdated) {
        onProfileUpdated(updatedProfile);
      }
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
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
          {avatarUrl && !avatarFile && (
            <div style={{ marginBottom: '10px', textAlign: 'center' }}>
              <img src={avatarUrl} alt="Current avatar" style={{ width: '80px', height: '80px', borderRadius: '50%' }} />
            </div>
          )}
          <div>
            <label htmlFor="avatar">Avatar (PNG, JPG, GIF - max 2MB):</label>
            <input
              type="file"
              id="avatar"
              accept="image/png, image/jpeg, image/gif"
              onChange={handleAvatarChange}
              disabled={loading}
            />
          </div>
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
