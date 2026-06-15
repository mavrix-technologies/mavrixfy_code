/**
 * TEST SCRIPT - yt-dlp YouTube Stream Fetcher
 * 
 * This script tests fetching stream URLs and video info using yt-dlp
 * 
 * Prerequisites:
 * 1. Install yt-dlp: pip install yt-dlp
 * 2. Run: node test-ytdlp.js
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Test with a popular song
const TEST_VIDEO_ID = 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up
const TEST_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

/**
 * Check if yt-dlp is installed
 */
async function checkYtDlpInstalled() {
  try {
    const { stdout } = await execAsync('python -m yt_dlp --version');
    console.log('✅ yt-dlp is installed, version:', stdout.trim());
    return true;
  } catch (error) {
    console.error('❌ yt-dlp is not installed!');
    console.error('Install it with: pip install yt-dlp');
    return false;
  }
}

/**
 * Fetch video info and stream URL
 */
async function fetchYouTubeStreamInfo(videoId) {
  console.log(`\n🔍 Fetching info for video ID: ${videoId}`);
  console.log(`📺 URL: https://www.youtube.com/watch?v=${videoId}\n`);
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    console.log('⏳ Extracting video information...\n');
    
    // Execute yt-dlp with JSON output for best audio
    const { stdout } = await execAsync(
      `python -m yt_dlp -j --no-warnings --format "bestaudio" "${url}"`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large JSON
    );
    
    const info = JSON.parse(stdout);
    
    // Extract key information
    const result = {
      videoId: info.id,
      title: info.title,
      artist: info.artist || info.uploader || info.channel || 'Unknown Artist',
      album: info.album || info.title,
      duration: info.duration,
      durationFormatted: formatDuration(info.duration),
      thumbnail: info.thumbnail,
      
      // Stream information
      streamUrl: info.url,
      streamFormat: info.ext,
      streamCodec: info.acodec,
      streamBitrate: info.abr,
      streamSampleRate: info.asr,
      streamFilesize: info.filesize ? formatFilesize(info.filesize) : 'Unknown',
      
      // Additional metadata
      viewCount: info.view_count,
      uploadDate: info.upload_date,
      description: info.description?.substring(0, 200) + '...',
    };
    
    return result;
    
  } catch (error) {
    console.error('❌ Error fetching stream info:', error.message);
    return null;
  }
}

/**
 * Fetch all available formats
 */
async function fetchAllFormats(videoId) {
  console.log(`\n🎵 Fetching all available formats...\n`);
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    const { stdout } = await execAsync(
      `python -m yt_dlp -j --no-warnings "${url}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const info = JSON.parse(stdout);
    
    // Filter audio-only formats
    const audioFormats = info.formats
      .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
      .map(f => ({
        formatId: f.format_id,
        ext: f.ext,
        codec: f.acodec,
        bitrate: f.abr,
        sampleRate: f.asr,
        filesize: f.filesize ? formatFilesize(f.filesize) : 'Unknown',
        url: f.url.substring(0, 80) + '...',
      }))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    
    return audioFormats;
    
  } catch (error) {
    console.error('❌ Error fetching formats:', error.message);
    return [];
  }
}

/**
 * Format duration in seconds to MM:SS
 */
function formatDuration(seconds) {
  if (!seconds) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format filesize in bytes to human readable
 */
function formatFilesize(bytes) {
  if (!bytes) return 'Unknown';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(2) + ' MB';
}

/**
 * Display results in a nice format
 */
function displayResults(info) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 VIDEO INFORMATION');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🆔 Video ID:     ${info.videoId}`);
  console.log(`🎵 Title:        ${info.title}`);
  console.log(`🎤 Artist:       ${info.artist}`);
  console.log(`💿 Album:        ${info.album}`);
  console.log(`⏱️  Duration:     ${info.durationFormatted} (${info.duration}s)`);
  console.log(`👁️  Views:        ${info.viewCount?.toLocaleString() || 'Unknown'}`);
  console.log(`📅 Upload Date:  ${info.uploadDate}`);
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🎧 STREAM INFORMATION');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🔊 Format:       ${info.streamFormat}`);
  console.log(`🎼 Codec:        ${info.streamCodec}`);
  console.log(`📈 Bitrate:      ${info.streamBitrate} kbps`);
  console.log(`🎚️  Sample Rate:  ${info.streamSampleRate} Hz`);
  console.log(`📦 Filesize:     ${info.streamFilesize}`);
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔗 STREAM URL (First 150 chars)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(info.streamUrl.substring(0, 150) + '...');
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🖼️  THUMBNAIL URL');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(info.thumbnail);
  console.log('═══════════════════════════════════════════════════════════\n');
}

/**
 * Display all available formats
 */
function displayFormats(formats) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎵 AVAILABLE AUDIO FORMATS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Found ${formats.length} audio-only formats:\n`);
  
  formats.forEach((format, index) => {
    console.log(`${index + 1}. Format ID: ${format.formatId}`);
    console.log(`   Extension: ${format.ext}`);
    console.log(`   Codec: ${format.codec}`);
    console.log(`   Bitrate: ${format.bitrate} kbps`);
    console.log(`   Sample Rate: ${format.sampleRate} Hz`);
    console.log(`   Filesize: ${format.filesize}`);
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

/**
 * Test with multiple video IDs
 */
async function testMultipleVideos() {
  const testVideos = [
    { id: 'dQw4w9WgXcQ', name: 'Rick Astley - Never Gonna Give You Up' },
    { id: 'kJQP7kiw5Fk', name: 'Luis Fonsi - Despacito' },
    { id: '9bZkp7q19f0', name: 'PSY - GANGNAM STYLE' },
  ];
  
  console.log('\n🧪 Testing with multiple videos...\n');
  
  for (const video of testVideos) {
    console.log(`\n📺 Testing: ${video.name}`);
    console.log(`🆔 Video ID: ${video.id}`);
    
    try {
      const info = await fetchYouTubeStreamInfo(video.id);
      if (info) {
        console.log(`✅ Success! Title: ${info.title}`);
        console.log(`🔗 Stream URL length: ${info.streamUrl.length} chars`);
        console.log(`📊 Bitrate: ${info.streamBitrate} kbps`);
      }
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    
    console.log('---');
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         YT-DLP YOUTUBE STREAM FETCHER TEST               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // Check if yt-dlp is installed
  const isInstalled = await checkYtDlpInstalled();
  if (!isInstalled) {
    return;
  }
  
  // Fetch stream info
  const info = await fetchYouTubeStreamInfo(TEST_VIDEO_ID);
  if (!info) {
    console.error('❌ Failed to fetch stream info');
    return;
  }
  
  // Display results
  displayResults(info);
  
  // Fetch all formats
  const formats = await fetchAllFormats(TEST_VIDEO_ID);
  if (formats.length > 0) {
    displayFormats(formats);
  }
  
  // Test with multiple videos (commented out to save time)
  // await testMultipleVideos();
  
  console.log('✅ Test completed successfully!\n');
  console.log('💡 To test with your own video:');
  console.log('   node test-ytdlp.js YOUR_VIDEO_ID\n');
}

// Allow passing video ID as command line argument
const customVideoId = process.argv[2];
if (customVideoId) {
  console.log(`\n🎯 Testing with custom video ID: ${customVideoId}\n`);
  
  checkYtDlpInstalled().then(async (isInstalled) => {
    if (!isInstalled) return;
    
    const info = await fetchYouTubeStreamInfo(customVideoId);
    if (info) {
      displayResults(info);
      
      const formats = await fetchAllFormats(customVideoId);
      if (formats.length > 0) {
        displayFormats(formats);
      }
    }
  });
} else {
  // Run main test
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
  });
}
