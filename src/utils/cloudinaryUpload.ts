// <== IMPORTS ==>
import getDataURI from "./dataURI.js";
import cloudinary from "./cloudinary.js";

// <== CLOUDINARY UPLOAD RESULT TYPE ==>
type CloudinaryUploadResult = {
  // <== URL ==>
  url: string;
  // <== PUBLIC ID ==>
  publicId: string;
};

/**
 * UPLOAD IMAGE TO CLOUDINARY
 * @param file - Multer File
 * @param folder - Cloudinary folder path (optional)
 * @returns Promise<CloudinaryUploadResult>
 */
// <== UPLOAD IMAGE TO CLOUDINARY ==>
export const uploadToCloudinary = async (
  file: Express.Multer.File,
  folder: string = "planora/profile-pictures"
): Promise<CloudinaryUploadResult> => {
  // CONVERTING FILE TO DATA URI
  const dataURI = getDataURI(file);
  // UPLOADING TO CLOUDINARY
  const uploadResult = await cloudinary.uploader.upload(dataURI, {
    // FOLDER PATH
    folder,
    // RESOURCE TYPE
    resource_type: "image",
    // ALLOWED FORMATS
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    // TRANSFORMATION OPTIONS (OPTIMIZE FOR PROFILE PICTURES)
    transformation: [
      {
        width: 400,
        height: 400,
        crop: "fill",
        gravity: "face",
        quality: "auto",
        fetch_format: "auto",
      },
    ],
    // OVERWRITE EXISTING FILES
    overwrite: false,
    // INVALIDATE CDN CACHE
    invalidate: true,
  });
  // RETURNING RESULT
  return {
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
  };
};

/**
 * DELETE IMAGE FROM CLOUDINARY
 * @param publicId - Cloudinary public ID
 * @returns Promise<void>
 */
// <== DELETE IMAGE FROM CLOUDINARY ==>
export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  // CHECK IF PUBLIC ID EXISTS
  if (!publicId || publicId.trim() === "") {
    return;
  }
  try {
    // DELETING FROM CLOUDINARY
    await cloudinary.uploader.destroy(publicId, {
      // RESOURCE TYPE
      resource_type: "image",
      // INVALIDATE CDN CACHE
      invalidate: true,
    });
  } catch (error) {
    // LOG ERROR BUT DON'T THROW (NON-CRITICAL)
    console.error(`Failed to delete image from Cloudinary: ${publicId}`, error);
  }
};
