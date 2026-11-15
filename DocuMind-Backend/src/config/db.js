import mongoose from "mongoose";

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is required");
    }
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
    return conn;
  } catch (err) {
    console.error(`MongoDB connection failed (${err.name || "UnknownError"})`);
    throw err;
  }
};

export default connectDB;
