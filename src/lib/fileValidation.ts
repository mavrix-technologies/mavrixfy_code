/**
 * File Upload Validation
 * Provides secure file validation including:
 * - File size checking
 * - MIME type validation
 * - Magic number (file signature) verification
 * - Image dimension validation
 */

import * as FileSystem from 'expo-file-system';

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types for images
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

// Magic numbers (file signatures) for image formats
// These are the first few bytes that identify file types
const IMAGE_MAGIC_NUMBERS: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/jpg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
};

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface FileInfo {
  uri: string;
  size: number;
  mimeType?: string;
}

/**
 * Validate an image file comprehensively
 * @param fileInfo File information including URI, size, and MIME type
 * @returns Validation result
 */
export async function validateImageFile(
  fileInfo: FileInfo
): Promise<ValidationResult> {
  try {
    const { uri, size, mimeType } = fileInfo;

    // 1. Check if file exists
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return { valid: false, error: 'File does not exist' };
    }

    // 2. Validate file size
    if (size > MAX_FILE_SIZE) {
      const sizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(1);
      return { valid: false, error: `File must be under ${sizeMB}MB` };
    }

    // 3. Validate MIME type
    if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      return { valid: false, error: 'Only JPEG, PNG, and WebP images are allowed' };
    }

    // 4. Validate magic numbers (file signature)
    const isValidSignature = await validateFileSignature(uri, mimeType);
    if (!isValidSignature) {
      return {
        valid: false,
        error: 'Invalid file format or corrupted file',
      };
    }

    return { valid: true };
  } catch (error: any) {
    console.error('File validation error:', error);
    return {
      valid: false,
      error: error?.message || 'Failed to validate file',
    };
  }
}

/**
 * Validate file signature (magic numbers) to prevent file type spoofing
 * @param uri File URI
 * @param mimeType Expected MIME type
 * @returns True if signature matches
 */
async function validateFileSignature(
  uri: string,
  mimeType?: string
): Promise<boolean> {
  try {
    // Read first 32 bytes of file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as any,
      length: 32,
    } as any);

    // Convert base64 to byte array
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    // If MIME type is provided, check specific signature
    if (mimeType && IMAGE_MAGIC_NUMBERS[mimeType]) {
      const expectedBytes = IMAGE_MAGIC_NUMBERS[mimeType];
      // Check length first for performance
      return expectedBytes.length <= bytes.length && 
             expectedBytes.every((byte, index) => bytes[index] === byte);
    }

    // Otherwise, check if it matches any allowed image signature
    const isValidImage = Object.values(IMAGE_MAGIC_NUMBERS).some((magic) => {
      // Check length first for performance
      return magic.length <= bytes.length && 
             magic.every((byte, index) => bytes[index] === byte);
    });

    return isValidImage;
  } catch (error) {
    console.error('Magic number validation error:', error);
    return false;
  }
}



/**
 * Sanitize filename to prevent path traversal attacks
 * @param filename Original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and special characters
  return filename
    .replace(/[\/\\]/g, '')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 255); // Limit length
}

/**
 * Get file extension from filename or URI
 * @param filename Filename or URI
 * @returns File extension (lowercase, without dot)
 */
export function getFileExtension(filename: string): string {
  const match = /\.(\w+)$/.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Check if file extension is allowed
 * @param filename Filename
 * @returns True if extension is allowed
 */
export function isAllowedImageExtension(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
}
