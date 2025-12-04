import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { connectDb, queryOne, query } from "../config/db.js";

dotenv.config();

const seedAdmin = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be set");
    process.exit(1);
  }

  await connectDb();

  const existing = await queryOne(
    `
      SELECT id
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [ADMIN_EMAIL]
  );

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  if (existing) {
    await query(
      `
        UPDATE users
        SET name = $1,
            password = $2,
            role = 'admin',
            is_active = true,
            updated_at = NOW()
        WHERE id = $3
      `,
      [ADMIN_NAME, hashedPassword, existing.id]
    );

    console.log(`Updated existing admin user ${ADMIN_EMAIL}`);
  } else {
    await query(
      `
        INSERT INTO users (name, email, password, role, is_active)
        VALUES ($1, $2, $3, 'admin', true)
      `,
      [ADMIN_NAME, ADMIN_EMAIL, hashedPassword]
    );

    console.log(`Created admin user ${ADMIN_EMAIL}`);
  }

  process.exit(0);
};

seedAdmin().catch((error) => {
  console.error("Failed to seed admin", error);
  process.exit(1);
});
