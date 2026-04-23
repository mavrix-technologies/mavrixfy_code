/**
 * Cloudinary Service for Mobile App
 * Handles direct image uploads to Cloudinary
 */

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

    // Create form data
    const formData = new FormData();
    
    // Extract filename and determine mime type
    const filename = imageUri.split('/').pop() || 'image.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    // Append file
    formData.append('file', {
      uri: imageUri,
      name: filename,
      type: type,
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
        headers: {
          'Content-Type': 'multipart/form-data',
        },
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
  } catch (error) {
    throw new Error('Failed to upload image. Please try again.');
  }
};

/**
 * Generates an optimized Cloudinary URL
 * @param publicIdOrUrl The public_id or full URL of the image
 * @param width Optional width
 * @param height Optional height
 * @returns Optimized image URL
 */
export const getOptimizedImageUrl = (
  publicIdOrUrl: string,
  width?: number,
  height?: number
): string => {
  if (!publicIdOrUrl) return '';

  // If this is already a full URL, return it
  if (publicIdOrUrl.startsWith('http')) {
    return publicIdOrUrl;
  }

  // Build transformation string
  const transformations = [];
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  transformations.push('c_fill', 'q_auto');

  const transformationString = transformations.join(',');

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transformationString}/${publicIdOrUrl}`;
};

/**
 * Generates a random color for placeholder
 */
const getRandomColor = (): string => {
  const colors = [
    '1DB954', // Spotify green
    '3D91F4', // blue
    'E13300', // red
    'FFA42B', // orange
    '8B2AC2', // purple
    '17A398', // teal
    'F73D93', // pink
    '43AA8B', // sage green
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

/**
 * Generates a placeholder image URL with text
 * @param text The text to show in the placeholder
 * @returns URL to the generated placeholder image
 */
export const getPlaceholderImageUrl = (text: string = 'Playlist'): string => {
  const color = getRandomColor();
  const letter = text.charAt(0).toUpperCase();
  
  const transformations = [
    'w_500',
    'h_500',
    'c_fill',
    `b_rgb:${color}`,
    `l_text:Arial_80_bold:${encodeURIComponent(letter)}`,
    'co_white',
    'g_center'
  ].join(',');

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transformations}/placeholder_text.png`;
};

/**
 * Validates image file
 * @param uri Image URI
 * @param maxSizeMB Maximum file size in MB
 * @returns Validation result
 */
export const validateImage = async (
  uri: string,
  maxSizeMB: number = 5
): Promise<{ valid: boolean; error?: string }> => {
  try {
    // Check if URI exists
    if (!uri) {
      return { valid: false, error: 'No image selected' };
    }

    // For now, we'll rely on the file picker's validation
    // In a production app, you might want to check file size here
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid image file' };
  }
};
