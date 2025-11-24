import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { connectDb } from "../config/db.js";
import { getDb } from "./client.js";
import { users } from "./schema.js";
import { eq } from "drizzle-orm";

dotenv.config();

const seedAdmin = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be set");
    process.exit(1);
  }

  await connectDb();
  const db = getDb();

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  if (existing) {
    await db
      .update(users)
      .set({
        name: ADMIN_NAME,
        password: hashedPassword,
        role: "admin",
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));

    console.log(`Updated existing admin user ${ADMIN_EMAIL}`);
  } else {
    await db.insert(users).values({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: "admin",
      isActive: true,
    });

    console.log(`Created admin user ${ADMIN_EMAIL}`);
  }

  process.exit(0);
};

seedAdmin().catch((error) => {
  console.error("Failed to seed admin", error);
  process.exit(1);
});
