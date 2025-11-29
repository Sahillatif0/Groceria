import mongoose from "mongoose";

let connectionPromise = null;

const getMongoUri = () =>
  process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/groceria";

export const connectMongo = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    await connectionPromise;
    return mongoose.connection;
  }

  const uri = getMongoUri();
  mongoose.set("strictQuery", true);

  connectionPromise = mongoose.connect(uri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await connectionPromise;
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ Failed to connect MongoDB", error.message);
    connectionPromise = null;
    throw error;
  }

  return mongoose.connection;
};

export const disconnectMongo = async () => {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  connectionPromise = null;
  console.log("ℹ️ MongoDB disconnected");
};

export const getMongoConnection = () => mongoose.connection;
