# MongoDB Migration Plan

This document captures the step-by-step work required to replace the current Postgres + Drizzle stack with a MongoDB database accessed through Mongoose.

## 1. Environment & Dependencies

- Install `mongoose` and remove Postgres-specific packages (`pg`, `drizzle-orm`, `drizzle-kit`).
- Add `.env` entry for `MONGODB_URI` (local default: `mongodb://127.0.0.1:27017/groceria`).
- Update `backend/src/app.js` (and any server bootstrapping code) to connect via the new Mongoose client before handling requests.

## 2. Database Client Layer

- Replace `src/db/client.js` with a Mongoose connection helper exporting `connectDb()`/`disconnectDb()`.
- Remove drizzle-specific exports like `getDb`, `getPool`.
- Delete `drizzle.config.*` files; they are no longer required.

## 3. Schema Definitions

- Re-implement each table as a Mongoose schema + model under `src/models/`:
  - `User`, `Seller`, `Product`, `Address`, `Order`, `OrderItem`, `ChatConversation`, `ChatMessage`, `AdminAuditLog`, `TransactionLog`.
- Mirror existing fields/defaults; use `timestamps: true` where appropriate.
- Use `ref` fields and `mongoose.Schema.Types.ObjectId` to keep relationships explicit (e.g., `userId`, `sellerId`).
- Consider embedding simple arrays (e.g., `orderItems`) later, but first match relational shape for easier controller refactors.

## 4. Controllers & Business Logic

- Update every controller to import Mongoose models instead of Drizzle table objects.
- Rewrite data access patterns:
  - `select` -> `find`/`findOne`/`lean`.
  - `insert` -> `create`/`insertMany`.
  - `update` -> `updateOne`/`findOneAndUpdate`.
  - `delete` -> `deleteOne`/`deleteMany`.
- Replace helper utilities (`buildProductsMap`, `attachOrderRelations`, etc.) with Mongoose-based queries or `populate`.
- Ensure validation logic (UUID checks, etc.) is adapted for Mongo ObjectIds (`mongoose.Types.ObjectId.isValid`).

## 5. Transaction / Audit Logging

- Recreate `TransactionLog` functionality as a Mongoose schema.
- Remove Postgres triggers; rely on the existing application-level logging helper, updated to use the new model.

## 6. Seed Scripts & Migrations

- Remove SQL migration files under `src/db/migrations`.
- Add optional seed scripts using Mongoose (e.g., `scripts/seedAdmin.js`).
- Document manual steps for creating indexes if needed (can use `schema.index`).

## 7. Testing & Rollout

- Update any Jest or integration tests to use an in-memory Mongo instance (e.g., `mongodb-memory-server`) if applicable.
- Verify core flows in dev: auth, cart, checkout, admin dashboards.
- Ensure `frontend` env variables or API contracts remain unchanged.

Following this plan, we can now implement the connection layer and migrate models/controllers incrementally.

## Current Status (Nov 2025)

- Steps 1–6 are complete: the backend connects to MongoDB via `mongoClient.js`, every controller/middleware uses Mongoose models, and Postgres artifacts (Drizzle configs, SQL migrations, Supabase client) have been removed.
- Admin/transaction logging utilities now persist directly to the `admin_audit_logs` and `transaction_logs` collections.
- The remaining work for future iterations lives in operational hardening (tests, optional indexes) and any data backfill required when deploying to new environments.
