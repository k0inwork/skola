import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { config } from "../lib/config.js";

const connectionString = config.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set in config.json or environment");
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
