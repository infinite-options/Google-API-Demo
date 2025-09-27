import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, TouchableOpacity, Text, View, Alert, Platform, ActivityIndicator, Image, Dimensions } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import GoogleApiService, { GoogleProfile, DriveFile, CalendarEvent, PhotoItem } from "@/services/googleApiService";

// Component to handle Google Photos URLs with authorization
function AuthorizedImage({ source, style, accessToken, ...props }: any) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!source?.uri || !accessToken) {
      setImageUri(source?.uri || null);
      setLoading(false);
      return;
    }

    // For Google Photos URLs, we need to fetch with authorization
    const fetchImageWithAuth = async () => {
      try {
        setLoading(true);
        console.log("Fetching image with auth:", source.uri);
        console.log("Using access token:", accessToken ? "Present" : "Missing");

        const response = await fetch(source.uri, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        console.log("Image fetch response:", response.status, response.statusText);

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          console.log("Image loaded successfully, blob URL created");
          setImageUri(url);
        } else {
          console.error("Failed to fetch image:", response.status, response.statusText);
          const errorText = await response.text();
          console.error("Error response body:", errorText);
          setError(true);
        }
      } catch (err) {
        console.error("Error fetching image:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchImageWithAuth();
  }, [source?.uri, accessToken]);

  if (loading) {
    return (
      <View style={[style, { backgroundColor: "#f8f9fa", justifyContent: "center", alignItems: "center" }]}>
        <ThemedText style={{ fontSize: 16, color: "#666" }}>⏳</ThemedText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[style, { backgroundColor: "#f0f0f0", justifyContent: "center", alignItems: "center" }]}>
        <ThemedText style={{ fontSize: 12, color: "#666" }}>📷</ThemedText>
      </View>
    );
  }

  return <Image source={{ uri: imageUri || source?.uri }} style={style} {...props} />;
}

const { width } = Dimensions.get("window");
const PHOTO_SIZE = (width - 60) / 3; // 3 photos per row with margins

export default function HomeScreen() {
  const [profile, setProfile] = useState<GoogleProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[] | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoItem[]>([]);
  const [googlePhotos, setGooglePhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if we have a stored access token
    const token = GoogleApiService.getAccessToken();
    if (token) {
      setAccessToken(token);
      // Optionally fetch profile on app start
      fetchProfile();
    }
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profileData = await GoogleApiService.fetchProfile();
      setProfile(profileData);
    } catch (error) {
      console.error("Error fetching profile:", error);
      Alert.alert("Error", "Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    try {
      setLoading(true);
      const result = await GoogleApiService.authenticate();

      if (result.success && result.profile) {
        setProfile(result.profile);
        setAccessToken(GoogleApiService.getAccessToken());
        Alert.alert("Success", "Successfully signed in with Google!");
      } else {
        Alert.alert("Error", result.error || "Authentication failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert("Error", "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    GoogleApiService.clearTokens();
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
      const data = await GoogleApiService.fetchDriveFiles();
      setDriveFiles(data.files);
    } catch (error) {
      console.error("Error fetching Drive files:", error);
      Alert.alert("Error", "Failed to fetch Drive files");
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const data = await GoogleApiService.fetchCalendarEvents(selectedDate);
      setCalendarEvents(data.items);
    } catch (error) {
      console.error("Error fetching Calendar events:", error);
      Alert.alert("Error", "Failed to fetch Calendar events");
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const photos = await GoogleApiService.fetchDrivePhotos();
      setSelectedPhotos(photos);
    } catch (error) {
      console.error("Error fetching photos:", error);
      Alert.alert("Error", "Failed to fetch photos");
    } finally {
      setLoading(false);
    }
  };

  const openPhotoPicker = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const photos = await GoogleApiService.openPhotoPicker();
      console.log("Photos received from Photo Picker:", photos);
      console.log("First photo structure:", photos[0]);
      setGooglePhotos(photos);
      Alert.alert("Success", `Loaded ${photos.length} photos from Google Photos!`);
    } catch (error) {
      console.error("Error opening Photo Picker:", error);
      Alert.alert("Error", "Failed to open Photo Picker");
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (size?: string) => {
    if (!size) return "";
    const bytes = parseInt(size);
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateTimeString?: string) => {
    if (!dateTimeString) return "";
    return new Date(dateTimeString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.includes("folder")) return "📁";
    if (mimeType?.includes("image")) return "🖼️";
    if (mimeType?.includes("document")) return "📄";
    if (mimeType?.includes("spreadsheet")) return "📊";
    if (mimeType?.includes("presentation")) return "📽️";
    return "📄";
  };

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#4285F4' />
        <ThemedText style={styles.loadingText}>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type='title'>Google APIs Demo</ThemedText>

        {!profile ? (
          <TouchableOpacity style={styles.loginButton} onPress={login}>
            <Text style={styles.loginButtonText}>Sign in with Google</Text>
          </TouchableOpacity>
        ) : (
          <View>
            {/* Profile Section */}
            <View style={styles.section}>
              <ThemedText type='subtitle'>Profile Information</ThemedText>
              <View style={styles.profileCard}>
                <ThemedText style={styles.profileText}>
                  <Text style={styles.bold}>Name:</Text> {profile.names?.[0]?.displayName || "N/A"}
                </ThemedText>
                <ThemedText style={styles.profileText}>
                  <Text style={styles.bold}>Email:</Text> {profile.emailAddresses?.[0]?.value || "N/A"}
                </ThemedText>
                <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                  <Text style={styles.logoutButtonText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Google Services */}
            <ThemedText type='subtitle' style={styles.servicesTitle}>
              Google Services
            </ThemedText>

            {/* Drive Section */}
            <View style={styles.serviceCard}>
              <ThemedText style={styles.serviceTitle}>📁 Google Drive</ThemedText>
              <ThemedText style={styles.serviceDescription}>View your most recently modified files</ThemedText>
              <TouchableOpacity style={styles.serviceButton} onPress={fetchDriveFiles}>
                <Text style={styles.serviceButtonText}>Load Recent Drive Files</Text>
              </TouchableOpacity>
            </View>

            {/* Calendar Section */}
            <View style={styles.serviceCard}>
              <ThemedText style={styles.serviceTitle}>📅 Google Calendar</ThemedText>
              <ThemedText style={styles.serviceDescription}>View events for a specific date</ThemedText>
              <View style={styles.datePickerContainer}>
                <Text style={styles.dateLabel}>Select Date:</Text>
                <TouchableOpacity style={styles.dateButton}>
                  <Text style={styles.dateButtonText}>{selectedDate}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.serviceButton} onPress={fetchCalendarEvents}>
                  <Text style={styles.serviceButtonText}>Load Calendar Events</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Photos Section */}
            <View style={styles.serviceCard}>
              <ThemedText style={styles.serviceTitle}>📷 Google Images</ThemedText>
              <ThemedText style={styles.serviceDescription}>Load images from Google Drive or use the Google Photo Picker</ThemedText>
              <View style={styles.photoButtonsContainer}>
                <TouchableOpacity style={styles.photoButton} onPress={fetchPhotos}>
                  <Text style={styles.photoButtonText}>Load Drive Images</Text>
                </TouchableOpacity>
                {Platform.OS === "web" && (
                  <TouchableOpacity style={styles.photoButton} onPress={openPhotoPicker}>
                    <Text style={styles.photoButtonText}>Open Photo Picker</Text>
                  </TouchableOpacity>
                )}
              </View>
              {Platform.OS !== "web" && <ThemedText style={styles.noteText}>Note: Photo Picker is only available on web platform</ThemedText>}
            </View>

            {/* Drive Files Results */}
            {driveFiles && (
              <View style={styles.resultsCard}>
                <ThemedText style={styles.resultsTitle}>Recent Drive Files ({driveFiles.length})</ThemedText>
                {driveFiles.length > 0 ? (
                  driveFiles.map((file) => (
                    <View key={file.id} style={styles.fileItem}>
                      <View style={styles.fileInfo}>
                        <ThemedText style={styles.fileName}>{file.name}</ThemedText>
                        <ThemedText style={styles.fileType}>
                          {getFileIcon(file.mimeType)} {file.mimeType?.includes("folder") ? "Folder" : "File"}
                        </ThemedText>
                      </View>
                      <View style={styles.fileMeta}>
                        <ThemedText style={styles.fileDate}>{formatDate(file.modifiedTime)}</ThemedText>
                        {file.size && <ThemedText style={styles.fileSize}>{formatFileSize(file.size)}</ThemedText>}
                      </View>
                    </View>
                  ))
                ) : (
                  <ThemedText style={styles.noDataText}>No files found</ThemedText>
                )}
              </View>
            )}

            {/* Calendar Events Results */}
            {calendarEvents && (
              <View style={styles.resultsCard}>
                <ThemedText style={styles.resultsTitle}>
                  Calendar Events for {formatDate(selectedDate)} ({calendarEvents.length})
                </ThemedText>
                {calendarEvents.length > 0 ? (
                  calendarEvents.map((event) => (
                    <View key={event.id} style={styles.eventItem}>
                      <View style={styles.eventInfo}>
                        <ThemedText style={styles.eventTitle}>{event.summary || "No Title"}</ThemedText>
                        <ThemedText style={styles.eventTime}>🕐 {event.start?.dateTime ? formatTime(event.start.dateTime) : event.start?.date ? "All Day Event" : "No start time"}</ThemedText>
                        {event.description && <ThemedText style={styles.eventDescription}>{event.description.substring(0, 100)}...</ThemedText>}
                      </View>
                      <View style={styles.eventMeta}>
                        {event.end?.dateTime && <ThemedText style={styles.eventEndTime}>Ends: {formatTime(event.end.dateTime)}</ThemedText>}
                        {event.location && <ThemedText style={styles.eventLocation}>📍 {event.location}</ThemedText>}
                      </View>
                    </View>
                  ))
                ) : (
                  <ThemedText style={styles.noDataText}>No events found for this date</ThemedText>
                )}
              </View>
            )}

            {/* Drive Photos Results */}
            {selectedPhotos.length > 0 && (
              <View style={styles.resultsCard}>
                <ThemedText style={styles.resultsTitle}>Drive Images ({selectedPhotos.length})</ThemedText>
                <View style={styles.photosGrid}>
                  {selectedPhotos.map((photo, index) => (
                    <View key={index} style={styles.photoItem}>
                      <View style={styles.photoPlaceholder}>
                        <Text style={styles.photoIcon}>📷</Text>
                        <Text style={styles.photoName}>{photo.name}</Text>
                      </View>
                      <View style={styles.photoInfo}>
                        <Text style={styles.photoType}>{photo.mimeType?.includes("image") ? "🖼️ Image" : "📄 File"}</Text>
                        {photo.size && <Text style={styles.photoSize}>{formatFileSize(photo.size)}</Text>}
                        {photo.modifiedTime && <Text style={styles.photoDate}>{formatDate(photo.modifiedTime)}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Google Photos Results */}
            {googlePhotos.length > 0 && (
              <View style={styles.resultsCard}>
                <ThemedText style={styles.resultsTitle}>Google Photos Library ({googlePhotos.length})</ThemedText>
                <View style={styles.photosGrid}>
                  {googlePhotos.map((photo, index) => (
                    <View key={index} style={styles.photoItem}>
                      {photo.thumbnails?.[0]?.url ? (
                        <AuthorizedImage source={{ uri: photo.thumbnails[0].url }} style={styles.photoImage} accessToken={accessToken} resizeMode='cover' />
                      ) : (
                        <View style={styles.photoPlaceholder}>
                          <Text style={styles.photoIcon}>📷</Text>
                        </View>
                      )}
                      <View style={styles.photoInfo}>
                        <Text style={styles.photoName}>{photo.name}</Text>
                        {photo.width && photo.height && (
                          <Text style={styles.photoDimensions}>
                            📐 {photo.width}x{photo.height}
                          </Text>
                        )}
                        {photo.creationTime && <Text style={styles.photoDate}>📅 {formatDate(photo.creationTime)}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: "#4285F4",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
    alignItems: "center",
  },
  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "#EA4335",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 12,
    alignSelf: "flex-start",
  },
  logoutButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    marginTop: 16,
  },
  servicesTitle: {
    marginTop: 24,
    marginBottom: 16,
  },
  profileCard: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginTop: 8,
  },
  profileText: {
    fontSize: 16,
    marginBottom: 8,
  },
  bold: {
    fontWeight: "600",
  },
  serviceCard: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 16,
  },
  serviceTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  serviceDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  serviceButton: {
    backgroundColor: "#34A853",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
  },
  serviceButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  datePickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginRight: 8,
  },
  dateButton: {
    backgroundColor: "#e9ecef",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  dateButtonText: {
    fontSize: 14,
    color: "#333",
  },
  photoButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoButton: {
    backgroundColor: "#4285F4",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
    flex: 1,
    minWidth: 120,
  },
  photoButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  noteText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginTop: 8,
  },
  resultsCard: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 16,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "#34A853",
  },
  fileItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a73e8",
    marginBottom: 4,
  },
  fileType: {
    fontSize: 12,
    color: "#666",
  },
  fileMeta: {
    alignItems: "flex-end",
  },
  fileDate: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
    color: "#666",
  },
  eventItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a73e8",
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  eventDescription: {
    fontSize: 12,
    color: "#666",
  },
  eventMeta: {
    alignItems: "flex-end",
  },
  eventEndTime: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  eventLocation: {
    fontSize: 12,
    color: "#666",
  },
  noDataText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  photoItem: {
    width: PHOTO_SIZE,
    marginBottom: 12,
    backgroundColor: "white",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    overflow: "hidden",
  },
  photoPlaceholder: {
    width: "100%",
    height: PHOTO_SIZE,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  photoIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  photoImage: {
    width: "100%",
    height: PHOTO_SIZE,
  },
  photoInfo: {
    padding: 8,
  },
  photoName: {
    fontSize: 12,
    color: "#333",
    marginBottom: 4,
    textAlign: "center",
  },
  photoType: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
  photoSize: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
  photoDate: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
  photoDimensions: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
});
