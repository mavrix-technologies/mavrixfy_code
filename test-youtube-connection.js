// Test YouTube Music API Connection
// Run this with: node test-youtube-connection.js

const YOUTUBE_API_URL = "https://mavrixfy-api-drab.vercel.app/api/youtube-music";

async function testConnection() {
  console.log("🔍 Testing YouTube Music API Connection...\n");
  console.log("URL:", YOUTUBE_API_URL);
  console.log("=" .repeat(60));

  // Test 1: Health Check
  console.log("\n[1/3] Testing Health Check...");
  try {
    const healthResponse = await fetch(`${YOUTUBE_API_URL}/health`);
    const healthData = await healthResponse.json();
    
    if (healthData.success && healthData.available) {
      console.log("✅ Health Check: PASSED");
      console.log("   Provider:", healthData.status?.provider || "unknown");
      console.log("   Status:", healthData.status?.status || "unknown");
    } else {
      console.log("❌ Health Check: FAILED");
      console.log("   Response:", JSON.stringify(healthData, null, 2));
      return false;
    }
  } catch (error) {
    console.log("❌ Health Check: ERROR");
    console.log("   Error:", error.message);
    return false;
  }

  // Test 2: Search
  console.log("\n[2/3] Testing Search...");
  try {
    const searchResponse = await fetch(
      `${YOUTUBE_API_URL}/search?query=test&filter=songs&limit=2`
    );
    const searchData = await searchResponse.json();
    
    if (searchData.success && searchData.results?.length > 0) {
      console.log("✅ Search: PASSED");
      console.log("   Results:", searchData.results.length);
      console.log("   First song:", searchData.results[0].title);
    } else {
      console.log("❌ Search: FAILED");
      console.log("   Response:", JSON.stringify(searchData, null, 2));
      return false;
    }
  } catch (error) {
    console.log("❌ Search: ERROR");
    console.log("   Error:", error.message);
    return false;
  }

  // Test 3: Stream Resolution
  console.log("\n[3/3] Testing Stream Resolution...");
  try {
    // Use a known working video ID
    const videoId = "dQw4w9WgXcQ"; // Rick Astley - Never Gonna Give You Up
    const streamResponse = await fetch(
      `${YOUTUBE_API_URL}/stream/${videoId}?platform=ios`
    );
    const streamData = await streamResponse.json();
    
    if (streamData.success && streamData.data?.url) {
      console.log("✅ Stream Resolution: PASSED");
      console.log("   Video ID:", videoId);
      console.log("   Stream URL:", streamData.data.url.substring(0, 80) + "...");
    } else {
      console.log("❌ Stream Resolution: FAILED");
      console.log("   Response:", JSON.stringify(streamData, null, 2));
      return false;
    }
  } catch (error) {
    console.log("❌ Stream Resolution: ERROR");
    console.log("   Error:", error.message);
    return false;
  }

  console.log("\n" + "=" .repeat(60));
  console.log("✅ ALL TESTS PASSED!\n");
  console.log("Your app configuration:");
  console.log(`  EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=${YOUTUBE_API_URL}`);
  console.log("\nNext steps:");
  console.log("  1. cd E:\\Mavrixfy\\Mavrixfy_App");
  console.log("  2. npx expo start --clear");
  console.log("  3. Open app and test YouTube playback\n");
  
  return true;
}

testConnection()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("\n❌ Unexpected error:", error);
    process.exit(1);
  });
