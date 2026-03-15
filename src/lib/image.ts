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
