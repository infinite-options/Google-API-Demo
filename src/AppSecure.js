import React, { useState, useEffect } from "react";

// Backend API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

function AppSecure() {
  const [profile, setProfile] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [driveFiles, setDriveFiles] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [googlePhotos, setGooglePhotos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if we have a stored access token
    const token = localStorage.getItem("access_token");
    if (token) {
      setAccessToken(token);
      // Optionally fetch profile on app start
      fetchProfile();
    }
  }, []);

  // Helper function to make authenticated API calls
  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...options.headers,
      },
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profileData = await apiCall("/api/user/profile");
      setProfile(profileData);
    } catch (error) {
      console.error("Error fetching profile:", error);
      alert("Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    try {
      setLoading(true);

      // Get OAuth URL from backend
      const { authUrl, sessionId } = await apiCall("/api/oauth/url");

      // Store session ID for later use
      sessionStorage.setItem("oauth_session_id", sessionId);

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error("Login error:", error);
      alert("Login failed");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    localStorage.removeItem("access_token");
    setProfile(null);
    setAccessToken(null);
    setDriveFiles(null);
    setCalendarEvents(null);
    setSelectedPhotos([]);
    setGooglePhotos([]);
  };

  const fetchDriveFiles = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await apiCall("/api/drive/files");
      setDriveFiles(data);
    } catch (error) {
      console.error("Error fetching Drive files:", error);
      alert("Failed to fetch Drive files");
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await apiCall(`/api/calendar/events?date=${selectedDate}`);
      setCalendarEvents(data);
    } catch (error) {
      console.error("Error fetching Calendar events:", error);
      alert("Failed to fetch Calendar events");
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await apiCall("/api/drive/photos");
      setSelectedPhotos(data.photos);
    } catch (error) {
      console.error("Error fetching photos:", error);
      alert("Failed to fetch photos");
    } finally {
      setLoading(false);
    }
  };

  const openPhotoPicker = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);

      // Create Photo Picker session
      const session = await apiCall("/api/photos/picker/session", {
        method: "POST",
      });

      if (!session.pickerUri) {
        throw new Error("Failed to get picker URI");
      }

      console.log("Redirecting to Photo Picker UI:", session.pickerUri);

      // Open the picker in a new window/tab
      const pickerWindow = window.open(session.pickerUri, "_blank", "width=800,height=600");

      // Poll for when the window is closed or check for updates
      const checkPickerStatus = setInterval(async () => {
        if (pickerWindow.closed) {
          clearInterval(checkPickerStatus);

          // Wait a bit for the session to be updated on Google's side
          setTimeout(async () => {
            try {
              const data = await apiCall(`/api/photos/picker/media?sessionId=${session.id}`);
              setGooglePhotos(data.photos);
              if (data.photos.length > 0) {
                alert(`Successfully loaded ${data.photos.length} photos from Google Photos!`);
              } else {
                alert("No photos were selected. Please try again and make sure to click 'Done' in the picker.");
              }
            } catch (error) {
              console.error("Error fetching selected photos:", error);
              alert("Failed to fetch selected photos");
            }
          }, 3000); // Wait 3 seconds for session to update
        }
      }, 1000);

      // Also try to fetch photos after a longer delay in case the window doesn't close properly
      setTimeout(async () => {
        clearInterval(checkPickerStatus);
        try {
          const data = await apiCall(`/api/photos/picker/media?sessionId=${session.id}`);
          setGooglePhotos(data.photos);
        } catch (error) {
          console.error("Error fetching selected photos:", error);
        }
      }, 30000); // 30 second timeout
    } catch (error) {
      console.error("Error opening Photo Picker:", error);
      alert(`Error opening Photo Picker: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");

    if (code && state) {
      const sessionId = sessionStorage.getItem("oauth_session_id");

      if (sessionId === state) {
        // Exchange code for token via backend
        const exchangeToken = async () => {
          try {
            setLoading(true);
            const tokenData = await apiCall("/api/oauth/token", {
              method: "POST",
              body: JSON.stringify({ code, state }),
            });

            // Store token
            localStorage.setItem("access_token", tokenData.access_token);
            setAccessToken(tokenData.access_token);

            // Fetch profile
            const profileData = await apiCall("/api/user/profile");
            setProfile(profileData);

            // Clean up URL
            window.history.replaceState({}, document.title, "/");
            sessionStorage.removeItem("oauth_session_id");

            alert("Successfully signed in with Google!");
          } catch (error) {
            console.error("Token exchange error:", error);
            alert("Authentication failed");
          } finally {
            setLoading(false);
          }
        };

        exchangeToken();
      }
    }
  }, []);

  const formatFileSize = (size) => {
    if (!size) return "";
    const bytes = parseInt(size);
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateTimeString) => {
    if (!dateTimeString) return "";
    return new Date(dateTimeString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getFileIcon = (mimeType) => {
    if (mimeType?.includes("folder")) return "📁";
    if (mimeType?.includes("image")) return "🖼️";
    if (mimeType?.includes("document")) return "📄";
    if (mimeType?.includes("spreadsheet")) return "📊";
    if (mimeType?.includes("presentation")) return "📽️";
    return "📄";
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", fontFamily: "sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: "24px", marginBottom: "1rem" }}>⏳</div>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Google APIs Demo (Secure Backend)</h1>
      <div
        style={{
          padding: "1rem",
          backgroundColor: "#d4edda",
          border: "1px solid #c3e6cb",
          borderRadius: "4px",
          marginBottom: "1rem",
          fontSize: "14px",
        }}
      >
        🔐 <strong>Secure Mode:</strong> Client secret is safely stored on the backend server. All Google API calls are proxied through the secure backend.
      </div>

      {!profile ? (
        <button
          onClick={login}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            backgroundColor: "#4285F4",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Sign in with Google
        </button>
      ) : (
        <div>
          <div style={{ marginTop: "1rem", border: "1px solid #ccc", padding: "1rem", borderRadius: "4px" }}>
            <h2>Profile Information</h2>
            <p>
              <strong>Name:</strong> {profile.names?.[0]?.displayName}
            </p>
            <p>
              <strong>Email:</strong> {profile.emailAddresses?.[0]?.value}
            </p>
            <button
              onClick={logout}
              style={{
                marginTop: "0.5rem",
                padding: "0.5rem 1rem",
                backgroundColor: "#EA4335",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </div>

          <div style={{ marginTop: "2rem" }}>
            <h2>Google Services</h2>

            {/* Drive Section */}
            <div style={{ marginBottom: "2rem", border: "1px solid #e0e0e0", padding: "1rem", borderRadius: "8px" }}>
              <h3 style={{ marginTop: 0, color: "#34A853" }}>Google Drive</h3>
              <p style={{ color: "#666", marginBottom: "1rem" }}>View your most recently modified files</p>
              <button
                onClick={fetchDriveFiles}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#34A853",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Load Recent Drive Files
              </button>
            </div>

            {/* Calendar Section */}
            <div style={{ marginBottom: "2rem", border: "1px solid #e0e0e0", padding: "1rem", borderRadius: "8px" }}>
              <h3 style={{ marginTop: 0, color: "#EA4335" }}>Google Calendar</h3>
              <p style={{ color: "#666", marginBottom: "1rem" }}>View events for a specific date</p>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
                <label htmlFor='datePicker' style={{ fontWeight: "bold" }}>
                  Select Date:
                </label>
                <input
                  id='datePicker'
                  type='date'
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "14px",
                  }}
                />
                <button
                  onClick={fetchCalendarEvents}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#EA4335",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Load Calendar Events
                </button>
              </div>
            </div>

            {/* Photo Picker Section */}
            <div style={{ marginBottom: "2rem", border: "1px solid #e0e0e0", padding: "1rem", borderRadius: "8px" }}>
              <h3 style={{ marginTop: 0, color: "#4285F4" }}>Google Images</h3>
              <p style={{ color: "#666", marginBottom: "1rem" }}>Load images from Google Drive or use the Google Photo Picker to select specific photos</p>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <button
                  onClick={fetchPhotos}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#34A853",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Load Drive Images
                </button>
                <button
                  onClick={openPhotoPicker}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#4285F4",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Open Google Photo Picker
                </button>
              </div>

              <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "#fff3cd", border: "1px solid #ffeaa7", borderRadius: "4px", fontSize: "14px" }}>
                <strong>📋 How to use Photo Picker:</strong>
                <ol style={{ margin: "0.5rem 0 0 1rem", paddingLeft: "1rem" }}>
                  <li>Click "Open Google Photo Picker" to open the Google Photos selection interface</li>
                  <li>Select the photos you want in the picker window</li>
                  <li>Click "Done" in the picker - photos will automatically appear below</li>
                </ol>
              </div>
            </div>

            {/* Results sections remain the same as before */}
            {driveFiles && (
              <div style={{ marginBottom: "2rem", border: "1px solid #34A853", padding: "1rem", borderRadius: "8px", backgroundColor: "#f8fff8" }}>
                <h3 style={{ color: "#34A853", marginTop: 0 }}>Recent Drive Files ({driveFiles.files?.length || 0})</h3>
                {driveFiles.files && driveFiles.files.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    {driveFiles.files.map((file) => (
                      <div
                        key={file.id}
                        style={{
                          padding: "0.75rem",
                          border: "1px solid #e0e0e0",
                          borderRadius: "4px",
                          backgroundColor: "white",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: "#1a73e8" }}>{file.name}</strong>
                            <br />
                            <small style={{ color: "#666" }}>
                              {getFileIcon(file.mimeType)} {file.mimeType?.includes("folder") ? "Folder" : "File"}
                            </small>
                          </div>
                          <div style={{ textAlign: "right", fontSize: "12px", color: "#666" }}>
                            <div>Modified: {formatDate(file.modifiedTime)}</div>
                            {file.size && <div>Size: {formatFileSize(file.size)}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "#666" }}>No files found</p>
                )}
              </div>
            )}

            {/* Calendar Events Results */}
            {calendarEvents && (
              <div style={{ marginBottom: "2rem", border: "1px solid #EA4335", padding: "1rem", borderRadius: "8px", backgroundColor: "#fff8f8" }}>
                <h3 style={{ color: "#EA4335", marginTop: 0 }}>
                  Calendar Events for {formatDate(selectedDate)} ({calendarEvents.items?.length || 0})
                </h3>
                {calendarEvents.items && calendarEvents.items.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    {calendarEvents.items.map((event) => (
                      <div
                        key={event.id}
                        style={{
                          padding: "0.75rem",
                          border: "1px solid #e0e0e0",
                          borderRadius: "4px",
                          backgroundColor: "white",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: "#1a73e8" }}>{event.summary || "No Title"}</strong>
                            <br />
                            <small style={{ color: "#666" }}>{event.start?.dateTime ? `🕐 ${formatTime(event.start.dateTime)}` : event.start?.date ? `📅 All Day Event` : "⏰ No start time"}</small>
                            {event.description && (
                              <>
                                <br />
                                <small style={{ color: "#666" }}>{event.description.substring(0, 100)}...</small>
                              </>
                            )}
                          </div>
                          <div style={{ textAlign: "right", fontSize: "12px", color: "#666" }}>
                            {event.end?.dateTime && <div>Ends: {formatTime(event.end.dateTime)}</div>}
                            {event.location && <div>📍 {event.location}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "#666" }}>No events found for this date</p>
                )}
              </div>
            )}

            {/* Drive Photos Results */}
            {selectedPhotos && selectedPhotos.length > 0 && (
              <div style={{ marginBottom: "2rem", border: "1px solid #34A853", padding: "1rem", borderRadius: "8px", backgroundColor: "#f8fff8" }}>
                <h3 style={{ color: "#34A853", marginTop: 0 }}>Drive Images ({selectedPhotos.length})</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
                  {selectedPhotos.map((photo, index) => (
                    <div
                      key={index}
                      style={{
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                        overflow: "hidden",
                        backgroundColor: "white",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "150px",
                          backgroundColor: "#f0f0f0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          position: "relative",
                          overflow: "hidden",
                        }}
                        onClick={() => {
                          window.open(photo.url, "_blank");
                        }}
                      >
                        <div style={{ textAlign: "center", color: "#666" }}>
                          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📷</div>
                          <div style={{ fontSize: "12px", marginBottom: "4px" }}>{photo.name}</div>
                          <div style={{ fontSize: "10px", color: "#999" }}>Click to view</div>
                        </div>
                      </div>
                      <div style={{ padding: "0.5rem" }}>
                        <div style={{ fontSize: "11px", color: "#999" }}>{photo.mimeType && photo.mimeType.includes("image") ? "🖼️ Image" : "📄 File"}</div>
                        {photo.size && <div style={{ fontSize: "10px", color: "#999" }}>Size: {formatFileSize(photo.size)}</div>}
                        {photo.modifiedTime && <div style={{ fontSize: "10px", color: "#999" }}>Modified: {formatDate(photo.modifiedTime)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Google Photos Results */}
            {googlePhotos && googlePhotos.length > 0 && (
              <div style={{ marginBottom: "2rem", border: "1px solid #4285F4", padding: "1rem", borderRadius: "8px", backgroundColor: "#f8f9ff" }}>
                <h3 style={{ color: "#4285F4", marginTop: 0 }}>Google Photos Library ({googlePhotos.length})</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
                  {googlePhotos.map((photo, index) => (
                    <div
                      key={index}
                      style={{
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                        overflow: "hidden",
                        backgroundColor: "white",
                      }}
                    >
                      <img
                        src={photo.thumbnails?.[0]?.url || photo.url}
                        alt={photo.name || `Photo ${index + 1}`}
                        style={{
                          width: "100%",
                          height: "150px",
                          objectFit: "cover",
                        }}
                      />
                      <div style={{ padding: "0.5rem" }}>
                        <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.25rem" }}>{photo.name || `Photo ${index + 1}`}</div>
                        <div style={{ fontSize: "11px", color: "#999" }}>{photo.width && photo.height ? `📐 ${photo.width}x${photo.height}` : "🖼️ Image"}</div>
                        {photo.creationTime && <div style={{ fontSize: "10px", color: "#999" }}>📅 {formatDate(photo.creationTime)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AppSecure;
