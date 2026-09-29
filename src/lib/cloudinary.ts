/**
 * Cloudinary Service for Mobile App
 * Handles direct image uploads to Cloudinary
 */

import { logger } from '@/lib/logger';
import * as FileSystem from 'expo-file-system/legacy';
import { isAllowedImageExtension,sanitizeFilename,validateImageFile } from './fileValidation';

// Cloudinary Configuration
const CLOUDINARY_CLOUD_NAME = 'djqq8kba8';
const CLOUDINARY_UPLOAD_PRESET = 'spotify_clone';

interface CloudinaryUploadResponse {
  public_id: string;
  version: number;
  signature: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  created_at: string;
  bytes: number;
  type: string;
  url: string;
  secure_url: string;
  original_filename: string;
}

/**
 * Uploads an image directly to Cloudinary using unsigned upload
 * @param imageUri Local file URI from device
 * @param onProgress Optional callback for upload progress
 * @returns Promise with the secure URL of the uploaded image
 */
export const uploadImageToCloudinary = async (
  imageUri: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    if (!imageUri) {
      throw new Error('No image URI provided');
    }

    // Extract filename
    const filename = imageUri.split('/').pop() || 'image.jpg';
    
    // Check file extension first (quick check)
    if (!isAllowedImageExtension(filename)) {
      throw new Error('Only JPEG, PNG, and WebP images are allowed');
    }

    // Get file info including size
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    const fileSize = ('size' in fileInfo) ? (fileInfo as any).size : 0;
    
    // Determine mime type from extension
    const match = /\.(\w+)$/.exec(filename);
    const ext = match ? match[1].toLowerCase() : 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    // Validate file comprehensively
    const validation = await validateImageFile({
      uri: imageUri,
      size: fileSize,
      mimeType,
    });

    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file');
    }

    // Sanitize filename to prevent security issues
    const safeFilename = sanitizeFilename(filename);

    // Create form data
    const formData = new FormData();
    
    // Append file with validated type
    formData.append('file', {
      uri: imageUri,
      name: safeFilename,
      type: mimeType,
    } as any);

    // Append Cloudinary parameters
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
    formData.append('folder', 'spotify_clone/playlists');

    // Upload to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Upload failed');
    }

    const data: CloudinaryUploadResponse = await response.json();
    
    // Call progress callback with 100% on success
    if (onProgress) {
      onProgress(100);
    }

    return data.secure_url;
  } catch (error: any) {
    logger.error('Cloudinary upload error:', error);
    throw new Error(error?.message || 'Failed to upload image. Please try again.');
  }
};

