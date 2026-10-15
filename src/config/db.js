// import mongoose from "mongoose";

// const connectDB = async () => {
//   if (mongoose.connection.readyState >= 1) {
//     return;
//   }

//   const uri = process?.env?.MONGO_URI;

//   if (!uri) {
//     console.error("MONGO_URI is not set in the environment.");
//     throw new Error("MONGO_URI is missing");
//   }

//   try {
//     mongoose.set("strictQuery", true);
//     const conn = await mongoose.connect(uri);
//     console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
//   } catch (error) {
//     console.error(`MongoDB connection error: ${error.message}`);
//     throw error;
//   }
// };

// export default connectDB;
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGO_URI environment variable');
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: true, // Yeh buffering timeout rokne mein madad karta hai
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log(`MongoDB connected: ${cached.conn.connection.host}/${cached.conn.connection.name}`);
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;