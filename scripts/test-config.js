#!/usr/bin/env node

/**
 * Test script to verify Google OAuth configuration
 */

const fs = require("fs");
const path = require("path");

console.log("🔍 Testing Google OAuth Configuration...\n");

// Check if .env file exists
const envPath = path.join(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) {
  console.log("❌ .env file not found");
  console.log("📝 Please create a .env file with your Google OAuth credentials");
  process.exit(1);
}

// Read .env file
const envContent = fs.readFileSync(envPath, "utf8");
const envVars = {};

envContent.split("\n").forEach((line) => {
  const [key, value] = line.split("=");
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

// Check required environment variables
const requiredVars = ["EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB", "EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID", "EXPO_PUBLIC_GOOGLE_CLIENT_SECRET_WEB"];

let allPresent = true;

console.log("📋 Environment Variables:");
requiredVars.forEach((varName) => {
  if (envVars[varName]) {
    console.log(`✅ ${varName}: ${envVars[varName].substring(0, 20)}...`);
  } else {
    console.log(`❌ ${varName}: Missing`);
    allPresent = false;
  }
});

if (!allPresent) {
  console.log("\n❌ Some required environment variables are missing");
  console.log("📝 Please add the missing variables to your .env file");
  process.exit(1);
}

// Check app.json configuration
const appJsonPath = path.join(__dirname, "..", "app.json");
if (!fs.existsSync(appJsonPath)) {
  console.log("❌ app.json not found");
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));

console.log("\n📱 App Configuration:");
console.log(`✅ App Name: ${appJson.expo.name}`);
console.log(`✅ Bundle ID (iOS): ${appJson.expo.ios?.bundleIdentifier || "Not set"}`);
console.log(`✅ Package Name (Android): ${appJson.expo.android?.package || "Not set"}`);
console.log(`✅ Scheme: ${appJson.expo.scheme}`);

// Check OAuth configuration in app.json
if (appJson.expo.extra) {
  console.log("\n🔐 OAuth Configuration:");
  console.log(`✅ Web Client ID: ${appJson.expo.extra.webClientId ? "Set" : "Not set"}`);
  console.log(`✅ Android Client ID: ${appJson.expo.extra.androidClientId ? "Set" : "Not set"}`);
  console.log(`✅ iOS Client ID: ${appJson.expo.extra.iosClientId ? "Set" : "Not set"}`);
  console.log(`✅ Client Secret: ${appJson.expo.extra.clientSecret ? "Set" : "Not set"}`);
} else {
  console.log("\n❌ OAuth configuration not found in app.json");
}

// Check if required files exist
const requiredFiles = ["config/oauth.ts", "services/googleApiService.ts", "app/(tabs)/index.tsx"];

console.log("\n📁 Required Files:");
requiredFiles.forEach((file) => {
  const filePath = path.join(__dirname, "..", file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file}: Missing`);
    allPresent = false;
  }
});

if (allPresent) {
  console.log("\n🎉 Configuration looks good! You can now run the app.");
  console.log("\n📱 To start the app:");
  console.log("   npm run web     # For web");
  console.log("   npm run ios     # For iOS");
  console.log("   npm run android # For Android");
} else {
  console.log("\n❌ Configuration is incomplete. Please fix the issues above.");
  process.exit(1);
}
