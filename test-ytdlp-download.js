/**
 * TEST SCRIPT - yt-dlp YouTube Downloader (Offline Download)
 * 
 * This script demonstrates DOWNLOADING songs for OFFLINE playback
 * 
 * Prerequisites:
 * 1. Install yt-dlp: pip install yt-dlp
 * 2. Install ffmpeg for MP3 conversion (optional)
 * 3. Run: node test-ytdlp-download.js
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Create downloads folder
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║     YT-DLP OFFLINE DOWNLOAD TEST (Audio Files)           ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

/**
 * Option 1: Download as M4A (fastest, no conversion needed)
 */
async function downloadAsM4A(videoId) {
  console.log(`\n📥 Downloading as M4A (no conversion)...\n`);
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(DOWNLOADS_DIR, '%(title)s.%(ext)s');
  
  return new Promise((resolve, reject) => {
    const args = [
      '-m', 'yt_dlp',
      '-f', 'bestaudio[ext=m4a]',
      '--no-warnings',
      '-o', outputPath,
      url
    ];
    
    console.log(`Command: python ${args.join(' ')}\n`);
    
    const process = spawn('python', args);
    
    process.stdout.on('data', (data) => {
      console.log(data.toString());
    });
    
    process.stderr.on('data', (data) => {
      console.error(data.toString());
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Download completed!\n');
        resolve();
      } else {
        reject(new Error(`Download failed with code ${code}`));
      }
    });
  });
}

/**
 * Option 2: Download and convert to MP3 (requires ffmpeg)
 */
async function downloadAsMP3(videoId) {
  console.log(`\n📥 Downloading and converting to MP3...\n`);
  console.log(`⚠️  Note: This requires ffmpeg to be installed\n`);
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(DOWNLOADS_DIR, '%(title)s.%(ext)s');
  
  return new Promise((resolve, reject) => {
    const args = [
      '-m', 'yt_dlp',
      '-x',  // Extract audio
      '--audio-format', 'mp3',
      '--audio-quality', '0',  // Best quality
      '--no-warnings',
      '-o', outputPath,
      url
    ];
    
    console.log(`Command: python ${args.join(' ')}\n`);
    
    const process = spawn('python', args);
    
    process.stdout.on('data', (data) => {
      console.log(data.toString());
    });
    
    process.stderr.on('data', (data) => {
      console.error(data.toString());
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Download and conversion completed!\n');
        resolve();
      } else {
        reject(new Error(`Download failed with code ${code}`));
      }
    });
  });
}

/**
 * Option 3: Get file info without downloading
 */
async function getDownloadInfo(videoId) {
  console.log(`\n📊 Getting download information...\n`);
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    const { stdout } = await execAsync(
      `python -m yt_dlp -j --no-warnings "${url}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const info = JSON.parse(stdout);
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 DOWNLOAD INFORMATION');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🎵 Title:        ${info.title}`);
    console.log(`🎤 Artist:       ${info.artist || info.uploader}`);
    console.log(`⏱️  Duration:     ${Math.floor(info.duration / 60)}:${Math.floor(info.duration % 60).toString().padStart(2, '0')}`);
    
    // Show download size for different formats
    console.log('\n📦 Available Download Sizes:');
    const audioFormats = info.formats
      .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));
    
    audioFormats.slice(0, 3).forEach((format, i) => {
      const sizeMB = format.filesize ? (format.filesize / (1024 * 1024)).toFixed(2) : 'Unknown';
      console.log(`   ${i + 1}. ${format.ext.toUpperCase()} - ${format.abr}kbps - ${sizeMB} MB`);
    });
    
    console.log('═══════════════════════════════════════════════════════════\n');
    
    return info;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

/**
 * List downloaded files
 */
function listDownloadedFiles() {
  console.log('\n📂 Downloaded Files:\n');
  
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.log('   No downloads folder found.\n');
    return;
  }
  
  const files = fs.readdirSync(DOWNLOADS_DIR)
    .filter(f => f.endsWith('.m4a') || f.endsWith('.mp3') || f.endsWith('.webm'));
  
  if (files.length === 0) {
    console.log('   No audio files downloaded yet.\n');
    return;
  }
  
  files.forEach((file, i) => {
    const filePath = path.join(DOWNLOADS_DIR, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   ${i + 1}. ${file} (${sizeMB} MB)`);
  });
  
  console.log(`\n   Total: ${files.length} file(s)\n`);
}

/**
 * Main menu
 */
async function main() {
  const videoId = process.argv[2] || 'dQw4w9WgXcQ';
  
  console.log(`\n🎯 Video ID: ${videoId}\n`);
  
  // Get download info first
  const info = await getDownloadInfo(videoId);
  if (!info) {
    console.error('❌ Failed to get video info');
    return;
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 DOWNLOAD OPTIONS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('1. Download as M4A (faster, no conversion)');
  console.log('2. Download as MP3 (requires ffmpeg)');
  console.log('3. Just show info (no download)');
  console.log('4. List downloaded files');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // For testing, let's download as M4A
  console.log('🚀 Running Option 1: Download as M4A\n');
  
  try {
    await downloadAsM4A(videoId);
    
    console.log(`📁 Files saved to: ${DOWNLOADS_DIR}\n`);
    
    listDownloadedFiles();
    
    console.log('✅ OFFLINE DOWNLOAD TEST COMPLETED!\n');
    console.log('💡 You can now play these files offline without internet.\n');
    console.log('📝 To test another video: node test-ytdlp-download.js VIDEO_ID\n');
    
  } catch (error) {
    console.error('❌ Download failed:', error.message);
  }
}

// Run
main().catch(console.error);
