import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

/**
 * Gives each test file its own throwaway in-memory MongoDB, so tests never touch
 * Atlas and need no database installed. Call once at the top of a test file.
 */
export const useTestDatabase = (): void => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db?.collections();
    for (const collection of collections ?? []) await collection.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
};
