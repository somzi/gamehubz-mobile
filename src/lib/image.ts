import i18n from '../i18n';
/**
 * Optimizes a Cloudinary URL by injecting transformation parameters.
 * If the URL is not a Cloudinary image, it returns the original URL.
 * 
 * @param url The original image URL
 * @param width Optional width for scaling (default: 400)
 * @returns Optimized URL string
 */
export const getOptimizedCloudinaryUrl = (url: string | undefined, width: number = 400): string => {
    if (!url) return '';

    // Check if it's a Cloudinary URL
    if (url.includes('cloudinary.com') && url.includes('/image/upload/')) {
        // Transformation string: width, limit fit, auto quality, auto format
        const transformation = `w_${width},c_limit,q_auto,f_auto`;

        // Inject transformation after '/upload/'
        return url.replace('/image/upload/', `/image/upload/${transformation}/`);
    }

    return url;
};
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB in bytes

/**
 * Checks if the file size of an ImagePickerAsset is within the allowed limit.
 * 
 * @param asset The ImagePickerAsset to check
 * @param maxSize The maximum allowed size in bytes (default: MAX_FILE_SIZE)
 * @returns boolean True if size is valid or unknown, false otherwise
 */
export const isFileSizeValid = (asset: { fileSize?: number | null }, maxSize: number = MAX_FILE_SIZE): boolean => {
    if (asset.fileSize === undefined || asset.fileSize === null) {
        // If fileSize is not available, we assume it's valid to avoid blocking users
        // though usually on mobile it should be available.
        return true;
    }
    return asset.fileSize <= maxSize;
};

/**
 * Formats a byte size into a human-readable string (e.g., "1.2 MB").
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return i18n.t('common:zeroBytes');
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
