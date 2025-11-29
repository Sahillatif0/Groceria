const path = require("path");
const { config } = require("dotenv");
const { defineConfig } = require("drizzle-kit");

config({ path: path.resolve(__dirname, ".env") });

module.exports = defineConfig({
  schema: "./db/schema.js",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    connectionString: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL,
    url: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL,
  },
});
