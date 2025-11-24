import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, ".env") });

export default defineConfig({
  schema: "./db/schema.js",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    connectionString: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL,
    url: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL,
  },
});
