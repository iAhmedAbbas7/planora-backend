// <== IMPORTS ==>
import mongoose from "mongoose";

// <== CONNECT DATABASE FUNCTION ==>
const connectDB = async (): Promise<void> => {
  // <== LOGGING CONNECTING MESSAGE ==>
  console.log("Connecting to MongoDB (^_^)");
  try {
    // <== CONNECTING DATABASE ==>
    await mongoose.connect(process.env.MONGO_URI!);
    // <== LOGGING SUCCESS MESSAGE ==>
    console.log("Connected Successfully to MongoDB (^_^)");
  } catch (error: any) {
    // <== LOGGING ERROR MESSAGE ==>
    console.log(error);
    // <== THROWING ERROR ==>
    throw new Error(
      `Internal Server Error, Please Try Again ::: ${error.message}`
    );
  }
};

// <== DISCONNECT DATABASE FUNCTION ==>
const disconnectDB = async (): Promise<void> => {
  // <== LOGGING DISCONNECTING MESSAGE ==>
  console.log("Disconnecting from MongoDB (^_^)");
  try {
    // <== DISCONNECTING DATABASE ==>
    await mongoose.disconnect();
    // <== LOGGING SUCCESS MESSAGE ==>
    console.log("Database Disconnected Successfully");
  } catch (error: any) {
    // <== LOGGING ERROR MESSAGE ==>
    console.log(error);
    // <== THROWING ERROR ==>
    throw new Error(`Disconnect Database is Failed -_- ::: ${error.message}`);
  }
};

export { connectDB, disconnectDB };
