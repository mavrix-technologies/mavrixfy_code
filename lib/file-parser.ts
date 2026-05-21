import { ParsedSong, FileParseResult } from "@/types/import";

/**
 * Parse CSV file content
 * Handles quoted fields, multiple formats, and headers
 * Enhanced to support Spotify export format with Track URI, ISRC, etc.
 */
export function parseCSV(content: string): FileParseResult {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  const songs: ParsedSong[] = [];
  const errors: string[] = [];

  if (lines.length === 0) {
    return { songs: [], errors: ['File is empty'], totalLines: 0 };
  }

  // Parse CSV line handling quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Parse header to detect column indices
  const headerLine = parseCSVLine(lines[0]);
  const headers = headerLine.map(h => h.toLowerCase().trim());
  
  // Detect column indices for Spotify format and generic formats
  const trackUriIdx = headers.findIndex(h => h.includes('track uri'));
  const trackNameIdx = headers.findIndex(h => 
    h.includes('track name') || h.includes('song') || h.includes('title') || h === 'name'
  );
  const artistNameIdx = headers.findIndex(h => 
    h.includes('artist name') && !h.includes('album artist')
  );
  const artistIdx = artistNameIdx !== -1 ? artistNameIdx : headers.findIndex(h => 
    h.includes('artist') || h.includes('singer')
  );
  const albumNameIdx = headers.findIndex(h => 
    h.includes('album name') && !h.includes('album artist')
  );
  const albumIdx = albumNameIdx !== -1 ? albumNameIdx : headers.findIndex(h => 
    h.includes('album')
  );
  const durationIdx = headers.findIndex(h => 
    h.includes('duration') || h.includes('length')
  );
  const isrcIdx = headers.findIndex(h => h.includes('isrc'));
  const popularityIdx = headers.findIndex(h => h.includes('popularity'));
  const explicitIdx = headers.findIndex(h => h.includes('explicit'));

  // If no proper headers found, assume simple format: title, artist
  const hasHeaders = trackNameIdx !== -1 || artistIdx !== -1;
  const startIdx = hasHeaders ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    try {
      const columns = parseCSVLine(lines[i]);
      
      if (columns.length < 2) {
        errors.push(`Line ${i + 1}: Not enough columns`);
        continue;
      }

      let title = '';
      let artist = '';
      let album = '';
      let duration = '';
      let trackUri = '';
      let isrc = '';
      let popularity = '';
      let explicit = false;

      if (hasHeaders) {
        // Use detected column indices
        trackUri = trackUriIdx !== -1 ? columns[trackUriIdx] : '';
        title = trackNameIdx !== -1 ? columns[trackNameIdx] : columns[1];
        artist = artistIdx !== -1 ? columns[artistIdx] : columns[3];
        album = albumIdx !== -1 ? columns[albumIdx] : '';
        duration = durationIdx !== -1 ? columns[durationIdx] : '';
        isrc = isrcIdx !== -1 ? columns[isrcIdx] : '';
        popularity = popularityIdx !== -1 ? columns[popularityIdx] : '';
        explicit = explicitIdx !== -1 ? columns[explicitIdx]?.toUpperCase() === 'TRUE' : false;
      } else {
        // Simple format: title, artist
        title = columns[0];
        artist = columns[1];
        duration = columns[2] || '';
      }

      // Clean up the data
      trackUri = trackUri.replace(/^["']|["']$/g, '').trim();
      title = title.replace(/^["']|["']$/g, '').trim();
      artist = artist.replace(/^["']|["']$/g, '').trim();
      album = album.replace(/^["']|["']$/g, '').trim();
      isrc = isrc.replace(/^["']|["']$/g, '').trim();
      
      // Clean up artist names - remove trailing commas and extra spaces
      artist = artist.replace(/,\s*$/, '').replace(/,\s+/g, ', ').trim();
      
      // Convert duration from ms to seconds if needed
      if (duration && !/:/.test(duration)) {
        const ms = parseInt(duration);
        if (!isNaN(ms)) {
          const seconds = Math.floor(ms / 1000);
          const mins = Math.floor(seconds / 60);
          const secs = seconds % 60;
          duration = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
      }

      if (title && artist) {
        songs.push({
          title,
          artist,
          album,
          duration: duration || '0:00',
          status: 'ready',
          spotifyUri: trackUri || undefined,
          isrc: isrc || undefined,
          popularity: popularity ? parseInt(popularity) : undefined,
          explicit: explicit || undefined,
        });
      } else {
        errors.push(`Line ${i + 1}: Missing title or artist`);
      }
    } catch (error) {
      errors.push(`Line ${i + 1}: Parse error`);
    }
  }
  
  return { songs, errors, totalLines: lines.length };
}

/**
 * Parse TXT file content
 * Handles multiple separators: -, by, tab
 */
export function parseTXT(content: string): FileParseResult {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  const songs: ParsedSong[] = [];
  const errors: string[] = [];

  if (lines.length === 0) {
    return { songs: [], errors: ['File is empty'], totalLines: 0 };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    let columns;
    
    try {
      if (line.includes(' - ')) {
        // Format: Artist - Title
        columns = line.split(' - ').map(part => part.trim());
        if (columns.length >= 2 && columns[0] && columns[1]) {
          songs.push({
            title: columns[1],
            artist: columns[0],
            status: 'ready'
          });
        } else {
          errors.push(`Line ${i + 1}: Invalid format (expected: Artist - Title)`);
        }
      } else if (line.includes(' by ')) {
        // Format: Title by Artist
        columns = line.split(' by ').map(part => part.trim());
        if (columns.length >= 2 && columns[0] && columns[1]) {
          songs.push({
            title: columns[0],
            artist: columns[1],
            status: 'ready'
          });
        } else {
          errors.push(`Line ${i + 1}: Invalid format (expected: Title by Artist)`);
        }
      } else if (line.includes('\t')) {
        // Tab-separated
        columns = line.split('\t').map(part => part.trim());
        if (columns.length >= 2 && columns[0] && columns[1]) {
          songs.push({
            title: columns[0],
            artist: columns[1],
            status: 'ready'
          });
        } else {
          errors.push(`Line ${i + 1}: Invalid format (expected: Title[TAB]Artist)`);
        }
      } else if (line.includes(',')) {
        // Comma-separated (simple CSV)
        columns = line.split(',').map(part => part.trim());
        if (columns.length >= 2 && columns[0] && columns[1]) {
          songs.push({
            title: columns[0],
            artist: columns[1],
            status: 'ready'
          });
        } else {
          errors.push(`Line ${i + 1}: Invalid format (expected: Title,Artist)`);
        }
      } else {
        // Just use as title with unknown artist
        songs.push({
          title: line,
          artist: 'Unknown Artist',
          status: 'ready'
        });
      }
    } catch (error) {
      errors.push(`Line ${i + 1}: Parse error - ${error}`);
    }
  }
  
  return { songs, errors, totalLines: lines.length };
}

/**
 * Parse file based on extension
 */
export function parseFile(content: string, fileName: string): FileParseResult {
  const extension = fileName.toLowerCase().split('.').pop();
  
  if (extension === 'csv') {
    return parseCSV(content);
  } else if (extension === 'txt') {
    return parseTXT(content);
  } else {
    return {
      songs: [],
      errors: ['Unsupported file format. Please use CSV or TXT files.'],
      totalLines: 0
    };
  }
}
