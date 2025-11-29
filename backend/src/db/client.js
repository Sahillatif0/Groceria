import pkg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const { Pool } = pkg;

let pool;
let dbInstance;

const createPool = () => {
  if (pool) {
    return pool;
  }

  const connectionString =
    process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Missing SUPABASE_DB_URL (or DATABASE_URL) environment variable"
    );
  }

  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  pool.on("error", (err) => {
    console.error("❌ Postgres pool error", err);
  });

  return pool;
};

export const connectDb = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  const activePool = createPool();
  dbInstance = drizzle(activePool);

  // quick smoke-test to verify connection
  await activePool.query("select 1");
  console.log("✅ Postgres connected via Supabase");
  return dbInstance;
};

export const getDb = () => {
  if (!dbInstance) {
    throw new Error("Database has not been initialised. Call connectDb() first.");
  }
  return dbInstance;
};

export const getPool = () => {
  if (!pool) {
    throw new Error("Pool has not been initialised. Call connectDb() first.");
  }

  return pool;
};
