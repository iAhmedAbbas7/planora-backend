// <== IMPORTS ==>
import path from "path";
import express from "express";
import { getDirName } from "../utils/getDirName.js";

// <== DIRNAME ==>
const __dirname = getDirName(import.meta.url);

// <== ROUTER ==>
const router = express.Router();

// <== ROUTE ==>
const rootRoute = router.get("^/$|/index(.html)?", (_req, res) => {
  // SENDING INDEX.HTML FILE
  try {
    res.sendFile(path.join(__dirname, "..", "..", "views", "index.html"));
  } catch (error: any) {
    // LOGGING ERROR MESSAGE
    console.log(error || "Unknown Error");
    // SENDING INTERNAL SERVER ERROR RESPONSE
    res.status(500).json({
      message: `Internal Server Error -_- ::: ${
        error?.message || "Unknown Error"
      }`,
      success: false,
    });
  }
});

export default rootRoute;
