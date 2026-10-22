import mongoose from "mongoose";
import { logger } from "./logger.js";

export const connectDB = async (uri: string): Promise<void> => {
  await mongoose.connect(uri);
  logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
};
