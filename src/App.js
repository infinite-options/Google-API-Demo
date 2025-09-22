import React, { useState, useEffect } from "react";

const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID_WEB;
const clientSecret = process.env.REACT_APP_GOOGLE_CLIENT_SECRET_WEB;
const redirectUri = "http://localhost:3000"; // MUST match dev server

// Debug: Log environment variables to confirm they're loaded
console.log("Environment variables loaded:");
console.log("REACT_APP_GOOGLE_CLIENT_ID_WEB:", clientId);
console.log("REACT_APP_GOOGLE_CLIENT_SECRET_WEB:", clientSecret ? `***${clientSecret.slice(-4)}` : "undefined");

const scope =
  "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/photoslibrary.readonly";

// Utility: base64url encode
function base64urlencode(arrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Utility: SHA256
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await window.crypto.subtle.digest("SHA-256", data);
}

function App() {
  const [profile, setProfile] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [driveFiles, setDriveFiles] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code && sessionStorage.getItem("code_verifier")) {
      const codeVerifier = sessionStorage.getItem("code_verifier");
      console.log("Authorization code detected:", code);
      console.log("Using code_verifier:", codeVerifier);

      // Prepare x-www-form-urlencoded body
      const body = new URLSearchParams();
      body.append("client_id", clientId);
      body.append("grant_type", "authorization_code");
      body.append("code", code);
      body.append("redirect_uri", redirectUri);
      body.append("code_verifier", codeVerifier);
      body.append("client_secret", clientSecret);

      console.log("Exchanging code for token with body:", Object.fromEntries(body));

      fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
        .then((res) => {
          console.log("Token endpoint status:", res.status);
          return res.json();
        })
        .then((data) => {
          console.log("Token response:", data);
          if (data.access_token) {
            console.log("Access token received, fetching profile...");
            setAccessToken(data.access_token);
            fetch("https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses", {
              headers: { Authorization: `Bearer ${data.access_token}` },
            })
              .then((res) => res.json())
              .then((profileData) => {
                console.log("Profile data:", profileData);
                setProfile(profileData);
                // Remove ?code=... from URL to prevent reuse
                window.history.replaceState({}, document.title, "/");
              });
          }
        })
        .catch((err) => console.error("Token exchange error:", err));
    }
  }, []);

  const login = async () => {
    console.log("Sign In button clicked");

    // Generate code_verifier
    const codeVerifier = Array.from(window.crypto.getRandomValues(new Uint8Array(64)))
      .map((b) => ("0" + b.toString(16)).slice(-2))
      .join("");
    sessionStorage.setItem("code_verifier", codeVerifier);
    console.log("Generated code_verifier:", codeVerifier);

    // Generate code_challenge
    const codeChallenge = base64urlencode(await sha256(codeVerifier));
    console.log("Generated code_challenge:", codeChallenge);

    // Build Google OAuth URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(
      scope
    )}&code_challenge=${codeChallenge}&code_challenge_method=S256&access_type=offline&prompt=consent`;

    console.log("Redirecting to Google OAuth URL:", authUrl);
    window.location.href = authUrl;
  };

  const fetchDriveFiles = async () => {
    if (!accessToken) return;

    try {
      console.log("Fetching Drive files...");
      const response = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink)&orderBy=modifiedTime desc", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      console.log("Drive files:", data);
      setDriveFiles(data);
    } catch (error) {
      console.error("Error fetching Drive files:", error);
    }
  };

  const fetchCalendarEvents = async () => {
    if (!accessToken) return;

    try {
      console.log("Fetching Calendar events for date:", selectedDate);
      const timeMin = `${selectedDate}T00:00:00Z`;
      const timeMax = `${selectedDate}T23:59:59Z`;
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=20&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      console.log("Calendar events:", data);
      setCalendarEvents(data);
    } catch (error) {
      console.error("Error fetching Calendar events:", error);
    }
  };

  const fetchPhotos = async () => {
    if (!accessToken) {
      console.error("No access token available");
      return;
    }

    try {
      console.log("Fetching Google Photos from Drive...");

      // Use Google Drive API to find image files
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType contains 'image/'&pageSize=20&fields=files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,thumbnailLink)&orderBy=modifiedTime desc",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Drive API error:", errorData);
        throw new Error(`Drive API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
      }

      const data = await response.json();
      console.log("Drive photos data:", data);

      // Transform the data to match the expected format
      const photos =
        data.files?.map((file) => ({
          id: file.id,
          name: file.name,
          url: file.webViewLink,
          thumbnails: file.thumbnailLink
            ? [
                {
                  url: file.thumbnailLink,
                },
              ]
            : [],
          mimeType: file.mimeType,
          size: file.size,
          modifiedTime: file.modifiedTime,
        })) || [];

      setSelectedPhotos(photos);
    } catch (error) {
      console.error("Error fetching photos:", error);
      alert(`Error fetching photos: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Google APIs Demo</h1>
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
              <h3 style={{ marginTop: 0, color: "#4285F4" }}>Google Drive Images</h3>
              <p style={{ color: "#666", marginBottom: "1rem" }}>Load recent image files from your Google Drive</p>
              <button
                onClick={fetchPhotos}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#4285F4",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Load Recent Images
              </button>
            </div>

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
                              {file.mimeType?.includes("folder")
                                ? "📁 Folder"
                                : file.mimeType?.includes("image")
                                ? "🖼️ Image"
                                : file.mimeType?.includes("document")
                                ? "📄 Document"
                                : file.mimeType?.includes("spreadsheet")
                                ? "📊 Spreadsheet"
                                : file.mimeType?.includes("presentation")
                                ? "📽️ Presentation"
                                : "📄 File"}
                            </small>
                          </div>
                          <div style={{ textAlign: "right", fontSize: "12px", color: "#666" }}>
                            <div>Modified: {new Date(file.modifiedTime).toLocaleDateString()}</div>
                            {file.size && <div>Size: {Math.round(file.size / 1024)} KB</div>}
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

            {calendarEvents && (
              <div style={{ marginBottom: "2rem", border: "1px solid #EA4335", padding: "1rem", borderRadius: "8px", backgroundColor: "#fff8f8" }}>
                <h3 style={{ color: "#EA4335", marginTop: 0 }}>
                  Calendar Events for{" "}
                  {new Date(selectedDate).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  ({calendarEvents.items?.length || 0})
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
                            <small style={{ color: "#666" }}>
                              {event.start?.dateTime
                                ? `🕐 ${new Date(event.start.dateTime).toLocaleTimeString("en-US", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}`
                                : event.start?.date
                                ? `📅 All Day Event`
                                : "⏰ No start time"}
                            </small>
                            {event.description && (
                              <>
                                <br />
                                <small style={{ color: "#666" }}>{event.description.substring(0, 100)}...</small>
                              </>
                            )}
                          </div>
                          <div style={{ textAlign: "right", fontSize: "12px", color: "#666" }}>
                            {event.end?.dateTime && (
                              <div>
                                Ends:{" "}
                                {new Date(event.end.dateTime).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </div>
                            )}
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

            {selectedPhotos && selectedPhotos.length > 0 && (
              <div style={{ marginBottom: "2rem", border: "1px solid #4285F4", padding: "1rem", borderRadius: "8px", backgroundColor: "#f8f9ff" }}>
                <h3 style={{ color: "#4285F4", marginTop: 0 }}>Drive Images ({selectedPhotos.length})</h3>
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
                        <div style={{ fontSize: "11px", color: "#999" }}>{photo.mimeType && photo.mimeType.includes("image") ? "🖼️ Image" : "📄 File"}</div>
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

export default App;
