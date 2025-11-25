// <== IMPORTS ==>
import path from "path";
import DataURIParser from "datauri/parser.js";

/**
 * DATA URI FUNCTION
 * @param file - Multer File
 * @returns string
 */
// <== DATA URI FUNCTION ==>
const getDataURI = (file: Express.Multer.File): string => {
  // CREATING DATA URI PARSER INSTANCE
  const parser = new DataURIParser();
  // GETTING FILE EXTENSION NAME
  const extName = path.extname(file.originalname).toString();
  // FORMATTING DATA URI AND GETTING CONTENT
  const result = parser.format(extName, file.buffer);
  // RETURNING DATA URI STRING
  return result.content || "";
};

export default getDataURI;
