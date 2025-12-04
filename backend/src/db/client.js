import pkg from "pg";

const { Pool } = pkg;

let pool;

const createPool = () => {
  if (pool) {
    return pool;
  }

  const connectionString =
    process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Missing SUPABASE_DB_URL or DATABASE_URL environment variable"
    );
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  pool.on("error", (err) => {
    console.error("Postgres pool error", err);
  });

  return pool;
};

export const connectDb = async () => {
  if (!pool) {
    createPool();
    await pool.query("select 1");
    console.log("Postgres connected");
  }

  return pool;
};

export const getPool = () => {
  if (!pool) {
    throw new Error("Database has not been initialised. Call connectDb() first.");
  }

  return pool;
};

const CAMEL_CACHE = new Map();

const toCamelCase = (key) => {
  if (!key || typeof key !== "string") {
    return key;
  }

  if (CAMEL_CACHE.has(key)) {
    return CAMEL_CACHE.get(key);
  }

  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  CAMEL_CACHE.set(key, camel);
  return camel;
};

const camelizeRow = (row) => {
  if (!row) {
    return row;
  }

  return Object.entries(row).reduce((acc, [key, value]) => {
    acc[toCamelCase(key)] = value;
    return acc;
  }, {});
};

const camelizeRows = (rows) => rows.map(camelizeRow);

export const query = async (text, params = [], client = null) => {
  const runner = client ?? getPool();
  return runner.query(text, params);
};

export const queryOne = async (text, params = [], client = null) => {
  const { rows } = await query(text, params, client);
  if (!rows.length) {
    return null;
  }
  return camelizeRow(rows[0]);
};

export const queryMany = async (text, params = [], client = null) => {
  const { rows } = await query(text, params, client);
  return camelizeRows(rows);
};

export const withTransaction = async (handler) => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const helpers = {
      query: (text, params = []) => query(text, params, client),
      queryOne: (text, params = []) => queryOne(text, params, client),
      queryMany: (text, params = []) => queryMany(text, params, client),
    };

    const result = await handler(helpers);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
