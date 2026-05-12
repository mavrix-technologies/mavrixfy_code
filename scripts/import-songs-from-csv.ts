import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { getMusicApiUrl } from '../lib/api-config';

interface CSVSong {
  trackUri: string;
  trackName: string;
  albumName: string;
  artistNames: string;
  releaseDate: string;
  duration: number;
  popularity: number;
  explicit: boolean;
  genres: string;
  recordLabel: string;
}

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  imageUrl: string;
  audioUrl: string;
}

// Parse CSV file
function parseCSV(filePath: string): CSVSong[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  const songs: CSVSong[] = [];
  
  // Skip header (first line)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    // Parse CSV with proper quote handling
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    if (values.length >= 13) {
      songs.push({
        trackUri: values[0],
        trackName: values[1].replace(/^"|"$/g, ''),
        albumName: values[2].replace(/^"|"$/g, ''),
        artistNames: values[3].replace(/^"|"$/g, ''),
        releaseDate: values[4],
        duration: parseInt(values[5]) || 0,
        popularity: parseInt(values[6]) || 0,
        explicit: values[7] === 'true',
        genres: values[10].replace(/^"|"$/g, ''),
        recordLabel: values[11].replace(/^"|"$/g, '')
      });
    }
  }
  
  return songs;
}

// Normalize string for comparison
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity score between two strings
function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);
  
  if (norm1 === norm2) return 1.0;
  
  const longer = norm1.length > norm2.length ? norm1 : norm2;
  const shorter = norm1.length > norm2.length ? norm2 : norm1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

// Levenshtein distance algorithm
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Search for song using multiple APIs
async function searchSong(song: CSVSong): Promise<SearchResult | null> {
  const artists = song.artistNames.split(';').map(a => a.trim());
  const primaryArtist = artists[0];
  
  console.log(`\nSearching: "${song.trackName}" by ${primaryArtist}`);
  
  // Try JioSaavn first
  const jiosaavnResult = await searchJioSaavn(song.trackName, primaryArtist, song);
  if (jiosaavnResult) {
    console.log(`✓ Found on JioSaavn: ${jiosaavnResult.title}`);
    return jiosaavnResult;
  }
  
  console.log(`✗ Not found: "${song.trackName}" by ${primaryArtist}`);
  return null;
}

// Search JioSaavn
async function searchJioSaavn(title: string, artist: string, originalSong: CSVSong): Promise<SearchResult | null> {
  try {
    const query = `${title} ${artist}`;
    const apiBase = getMusicApiUrl().replace(/\/+$/, '');
    const response = await axios.get(`${apiBase}/api/search/songs`, {
      params: { query, limit: 10 },
      timeout: 10000
    });
    
    if (response.data?.data?.results) {
      const results = response.data.data.results;
      let bestMatch: any = null;
      let bestScore = 0;
      
      for (const result of results) {
        const titleScore = calculateSimilarity(originalSong.trackName, result.title);
        const artistScore = calculateSimilarity(artist, result.primaryArtists);
        const durationDiff = Math.abs(originalSong.duration - (result.duration * 1000));
        const durationScore = 1 - Math.min(durationDiff / originalSong.duration, 1);
        
        const totalScore = (titleScore * 0.5) + (artistScore * 0.3) + (durationScore * 0.2);
        
        if (totalScore > bestScore && totalScore > 0.7) {
          bestScore = totalScore;
          bestMatch = result;
        }
      }
      
      if (bestMatch) {
        return {
          id: bestMatch.id,
          title: bestMatch.title,
          artist: bestMatch.primaryArtists,
          album: bestMatch.album?.name || '',
          duration: bestMatch.duration,
          imageUrl: bestMatch.image?.[2]?.link || bestMatch.image?.[1]?.link || '',
          audioUrl: bestMatch.downloadUrl?.[4]?.link || bestMatch.downloadUrl?.[3]?.link || ''
        };
      }
    }
  } catch (error: any) {
    console.error('JioSaavn search error:', error.message);
  }
  
  return null;
}

// Main import function
async function importSongs(csvPath: string, limit?: number) {
  console.log('Starting song import...\n');
  console.log(`CSV File: ${csvPath}`);
  
  const songs = parseCSV(csvPath);
  console.log(`Parsed ${songs.length} songs from CSV`);
  
  const songsToImport = limit ? songs.slice(0, limit) : songs;
  console.log(`Importing ${songsToImport.length} songs...\n`);
  
  const results = {
    found: [] as SearchResult[],
    notFound: [] as CSVSong[],
    total: songsToImport.length
  };
  
  for (const song of songsToImport) {
    const result = await searchSong(song);
    
    if (result) {
      results.found.push(result);
    } else {
      results.notFound.push(song);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total songs: ${results.total}`);
  console.log(`Found: ${results.found.length} (${((results.found.length / results.total) * 100).toFixed(1)}%)`);
  console.log(`Not found: ${results.notFound.length} (${((results.notFound.length / results.total) * 100).toFixed(1)}%)`);
  
  // Save results
  const outputPath = path.join(__dirname, '../outputs/import-results.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
  
  return results;
}

// Run the script
if (process.argv.length < 3) {
  console.error('Error: CSV file path is required');
  console.log('\nUsage: npm run import:songs <csvPath> [limit]');
  console.log('Example: npm run import:songs my-playlist.csv 50');
  process.exit(1);
}

const csvPath = process.argv[2];
const limit = parseInt(process.argv[3]) || undefined; // No limit if not specified

if (!fs.existsSync(csvPath)) {
  console.error(`Error: File not found: ${csvPath}`);
  process.exit(1);
}

importSongs(csvPath, limit)
  .then(() => {
    console.log('\nImport completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nImport failed:', error);
    process.exit(1);
  });
