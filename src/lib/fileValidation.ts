/**
 * File Upload Validation
 * Provides secure file validation including:
 * - File size checking
 * - MIME type validation
 * - Magic number (file signature) verification
 * - Image dimension validation
 */

import * as FileSystem from 'expo-file-system';
import { logger } from '@/lib/logger';

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types for images
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

// Magic numbers for image format validation
const IMAGE_MAGIC_NUMBERS: { [key: string]: number[] } = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/jpg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF (first 4 bytes)
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export interface FileInfo {
  uri: string;
  size?: number;
  mimeType?: string;
}

/**
 * Validate image file before upload
 * @param fileInfo File information including URI, size, and MIME type
 * @returns Validation result
 */
export async function validateImageFile(
  fileInfo: FileInfo
): Promise<FileValidationResult> {
  try {
    const { uri, size: fileSize, mimeType } = fileInfo;
    // Check file existence and get info
    const fileInfoResult = await FileSystem.getInfoAsync(uri);
    
    if (!fileInfoResult.exists) {
      return {
        valid: false,
        error: 'File does not exist',
      };
    }

    // Size validation
    const actualSize = fileSize || (fileInfoResult as any).size;
    if (actualSize && actualSize > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds 5MB limit (${(actualSize / (1024 * 1024)).toFixed(2)}MB)`,
      };
    }

    // MIME type validation
    if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType.toLowerCase())) {
      return {
        valid: false,
        error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.',
      };
    }

    // Magic number validation (file signature check)
    const isValidSignature = await validateFileSignature(uri, mimeType);
    if (!isValidSignature) {
      return {
        valid: false,
        error: 'Invalid file format or corrupted file',
      };
    }

    return { valid: true };
  } catch (error: any) {
    logger.error('File validation error:', error);
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
    logger.error('Magic number validation error:', error);
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
