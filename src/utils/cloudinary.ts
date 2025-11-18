// <== IMPORTS ==>
dotenv.config({});
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

/**
 * CONFIGURING CLOUDINARY
 * @returns void
 */
// <== CONFIGURING CLOUDINARY ==>
cloudinary.config({
  // CLOUD NAME
  cloud_name: process.env.CLOUD_NAME!,
  // API KEY
  api_key: process.env.API_KEY!,
  // API SECRET
  api_secret: process.env.API_SECRET!,
});

// <== EXPORTING CLOUDINARY ==>
export default cloudinary;
