#!/usr/bin/env node
/**
 * Piped API Test Script
 * 
 * Tests the Piped service directly from Node.js to verify it works
 * before running in the mobile app.
 * 
 * Usage:
 *   node test-piped.js
 *   node test-piped.js VIDEO_ID
 */

const VIDEO_IDS = {
  rickRoll: "dQw4w9WgXcQ",
  blankSpace: "e-ORhEE9VVg", // Taylor Swift - Blank Space
  hotlineBling: "uxpDa-c-4Mc", // Drake - Hotline Bling
  shapeOfYou: "JGwWNGJdvx8", // Ed Sheeran - Shape of You
};

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://pipedapi-libre.kavin.rocks",
  "https://piped-api.privacy.com.de",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.owo.si",
  "https://pipedapi.ducks.party",
  "https://piped-api.codespace.cz",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.private.coffee",
  "https://pipedapi.darkness.services",
  "https://pipedapi.orangenet.cc",
];

// ─── Test Functions ───────────────────────────────────────────────────────────

async function testPipedStream(videoId, instanceUrl, timeoutMs = 6000) {
  const url = `${instanceUrl}/streams/${videoId}`;
  console.log(`\n📡 Testing: ${instanceUrl}`);
  console.log(`   Video ID: ${videoId}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const start = Date.now();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const elapsed = Date.now() - start;
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`   ❌ HTTP ${response.status} - Failed`);
      return { success: false, elapsed, status: response.status };
    }

    const data = await response.json();
    const audioStreams = data.audioStreams || [];

    if (audioStreams.length === 0) {
      console.log(`   ❌ No audio streams available`);
      return { success: false, elapsed };
    }

    // Get best quality stream
    const bestStream = audioStreams[0];
    console.log(`   ✅ Success! (${elapsed}ms)`);
    console.log(`   📊 Title: ${data.title || "Unknown"}`);
    console.log(`   🎵 Audio Streams: ${audioStreams.length}`);
    console.log(`   🎚️ Best Quality: ${bestStream.quality || "unknown"}`);
    console.log(`   📈 Bitrate: ${bestStream.bitrate || 0} bps`);
    console.log(`   🔗 Stream URL: ${bestStream.url ? bestStream.url.substring(0, 50) + "..." : "N/A"}`);

    return {
      success: true,
      elapsed,
      title: data.title,
      audioStreams: audioStreams.length,
      bestQuality: bestStream.quality,
      bitrate: bestStream.bitrate,
      streamUrl: bestStream.url,
    };
  } catch (error) {
    clearTimeout(timeout);
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testAllInstances(videoId, instances = PIPED_INSTANCES) {
  console.log("\n" + "=".repeat(70));
  console.log(`🧪 TESTING ALL PIPED INSTANCES`);
  console.log("=".repeat(70));

  const results = [];
  for (const instance of instances) {
    const result = await testPipedStream(videoId, instance);
    results.push({ instance, ...result });
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 SUMMARY");
  console.log("=".repeat(70));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\n✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);

  if (successful.length > 0) {
    const avgTime = successful.reduce((sum, r) => sum + r.elapsed, 0) / successful.length;
    const fastest = successful.reduce((min, r) => (r.elapsed < min.elapsed ? r : min));
    console.log(`\n⚡ Average Response Time: ${Math.round(avgTime)}ms`);
    console.log(`🏆 Fastest Instance: ${fastest.instance} (${fastest.elapsed}ms)`);
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed Instances:`);
    failed.forEach((r) => {
      console.log(`   - ${r.instance}: ${r.error || `HTTP ${r.status}`}`);
    });
  }

  console.log("\n" + "=".repeat(70));

  return { successful, failed };
}

async function testHealthCheck() {
  console.log("\n" + "=".repeat(70));
  console.log(`🏥 HEALTH CHECK - All Instances`);
  console.log("=".repeat(70));

  const results = await Promise.allSettled(
    PIPED_INSTANCES.map(async (instance) => {
      const start = Date.now();
      const response = await fetch(`${instance}/trending?region=US`, {
        signal: AbortSignal.timeout(5000),
      });
      const elapsed = Date.now() - start;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { instance, elapsed, status: "healthy" };
    })
  );

  const healthy = [];
  const unhealthy = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      healthy.push(result.value);
      console.log(`✅ ${result.value.instance} - OK (${result.value.elapsed}ms)`);
    } else {
      unhealthy.push({ instance: PIPED_INSTANCES[index], error: result.reason.message });
      console.log(`❌ ${PIPED_INSTANCES[index]} - ${result.reason.message}`);
    }
  });

  console.log(`\n📊 Health: ${healthy.length}/${PIPED_INSTANCES.length} healthy`);

  if (healthy.length > 0) {
    const fastest = healthy.reduce((min, r) => (r.elapsed < min.elapsed ? r : min));
    console.log(`🏆 Fastest: ${fastest.instance} (${fastest.elapsed}ms)`);
  }

  console.log("=".repeat(70));

  return { healthy, unhealthy };
}

async function testSearch(query = "Drake") {
  console.log("\n" + "=".repeat(70));
  console.log(`🔍 TESTING SEARCH: "${query}"`);
  console.log("=".repeat(70));

  const instance = PIPED_INSTANCES[0];
  const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`;

  try {
    const start = Date.now();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Date.now() - start;

    if (!response.ok) {
      console.log(`❌ Search failed: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();
    const items = data.items || [];
    const songs = items.filter((item) => item.type === "stream");

    console.log(`✅ Search completed in ${elapsed}ms`);
    console.log(`📊 Found ${songs.length} songs`);

    if (songs.length > 0) {
      console.log(`\n🎵 Top 5 Results:`);
      songs.slice(0, 5).forEach((song, index) => {
        console.log(`   ${index + 1}. ${song.title || "Unknown"}`);
        console.log(`      by ${song.uploaderName || "Unknown"}`);
        console.log(`      Duration: ${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, "0")}`);
      });
    }
  } catch (error) {
    console.log(`❌ Search error: ${error.message}`);
  }

  console.log("=".repeat(70));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                   🎵 PIPED API TEST SUITE 🎵                      ║
║                                                                   ║
║  Tests Piped API integration for Mavrixfy YouTube Music          ║
║  streaming. Verifies instances work before mobile deployment.    ║
╚═══════════════════════════════════════════════════════════════════╝
  `);

  const videoId = process.argv[2] || VIDEO_IDS.rickRoll;

  console.log(`\n🎯 Test Configuration:`);
  console.log(`   Video ID: ${videoId}`);
  console.log(`   Instances: ${PIPED_INSTANCES.length}`);
  console.log(`   Timeout: 6s per stream request`);

  // Run tests
  const health = await testHealthCheck();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const streamInstances = health.healthy.length > 0
    ? health.healthy.map((item) => item.instance)
    : PIPED_INSTANCES.slice(0, 5);

  await testAllInstances(videoId, streamInstances);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await testSearch("Taylor Swift");

  // Final verdict
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🎉 TEST COMPLETE`);
  console.log(`${"=".repeat(70)}`);
  console.log(`\nIf you see ✅ successful instances above, Piped is working!`);
  console.log(`The mobile app will use these same endpoints.\n`);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { testPipedStream, testAllInstances, testHealthCheck, testSearch };
