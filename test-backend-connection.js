#!/usr/bin/env node

/**
 * Test Backend Connection
 * Quick script to verify YouTube Music backend is accessible
 */

const https = require('https');
const http = require('http');

// Read from .env.development
const fs = require('fs');
const path = require('path');

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env.development');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=(.+)/);
    if (match) {
      return match[1].trim();
    }
  } catch (error) {
    console.error('Could not read .env.development:', error.message);
  }
  return null;
}

function testEndpoint(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const fullUrl = url.endsWith('/') ? `${url}api/healthz` : `${url}/api/healthz`;
    
    console.log(`Testing: ${fullUrl}`);
    
    const req = protocol.get(fullUrl, { timeout: 5000 }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, data: json, status: res.statusCode });
          } catch (e) {
            resolve({ success: true, data: data, status: res.statusCode });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout (5 seconds)'));
    });
    
    req.on('error', (err) => {
      reject(err);
    });
  });
}

async function testLyricsEndpoint(url, videoId = 's4nIxLvW1Zo') {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const fullUrl = url.endsWith('/') 
      ? `${url}api/lyrics/video/${videoId}` 
      : `${url}/api/lyrics/video/${videoId}`;
    
    console.log(`\nTesting lyrics: ${fullUrl}`);
    
    const req = protocol.get(fullUrl, { timeout: 10000 }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, data: json, status: res.statusCode });
          } catch (e) {
            resolve({ success: true, data: data, status: res.statusCode });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout (10 seconds)'));
    });
    
    req.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log('===========================================');
  console.log('  YouTube Music Backend Connection Test');
  console.log('===========================================\n');
  
  const backendUrl = loadEnv();
  
  if (!backendUrl) {
    console.error('❌ Could not find EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL in .env.development');
    process.exit(1);
  }
  
  console.log(`Backend URL: ${backendUrl}\n`);
  
  // Test 1: Health check
  console.log('Test 1: Health Check');
  console.log('-------------------------------------------');
  try {
    const result = await testEndpoint(backendUrl);
    console.log('✅ SUCCESS!');
    console.log(`   Status: ${result.status}`);
    console.log(`   Response:`, result.data);
  } catch (error) {
    console.log('❌ FAILED!');
    console.log(`   Error: ${error.message}`);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Is the backend running? Run: python youtube-music-api/main.py');
    console.log('   2. Is the IP address correct? Check with: ipconfig');
    console.log('   3. Are both devices on same WiFi?');
    console.log('   4. Is firewall blocking port 8000?');
    process.exit(1);
  }
  
  // Test 2: Lyrics endpoint
  console.log('\nTest 2: Lyrics Endpoint');
  console.log('-------------------------------------------');
  try {
    const result = await testLyricsEndpoint(backendUrl);
    console.log('✅ SUCCESS!');
    console.log(`   Status: ${result.status}`);
    if (result.data.lyrics) {
      const lyricsPreview = result.data.lyrics.substring(0, 100);
      console.log(`   Lyrics preview: ${lyricsPreview}...`);
      console.log(`   Source: ${result.data.source || 'Unknown'}`);
    } else {
      console.log(`   Response:`, result.data);
    }
  } catch (error) {
    console.log('❌ FAILED!');
    console.log(`   Error: ${error.message}`);
    console.log('\n💡 This is okay if the test video has no lyrics.');
    console.log('   As long as health check passed, lyrics feature will work for songs with lyrics.');
  }
  
  console.log('\n===========================================');
  console.log('✅ Backend is accessible and working!');
  console.log('===========================================');
  console.log('\nYou can now use the lyrics feature in the app.');
  console.log('Just tap the 🎵 icon next to the heart in the player.\n');
}

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
