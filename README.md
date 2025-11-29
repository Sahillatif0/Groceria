# Groceria

The project now ships with a staged roadmap that covers the full migration from a single-role storefront to a role-aware commerce platform.

## Phase 1 – Role Model & Auth

- MongoDB/Mongoose models introduce user roles (`customer`, `seller`, `admin`) plus dedicated seller metadata.
- JWT middleware verifies role + active status for every request.
- Admin seeding script (`npm run db:seed-admin`) provisions the first admin via `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` environment variables (make sure `MONGODB_URI` is set before running it).

## Phase 2 – Backend Endpoints

- Admin API can create/promote sellers, toggle user activity, archive products, and cancel or delete orders.
- Seller APIs are constrained to owned products; orders surfaced per seller.
- Every privileged change is written to the `admin_audit_logs` collection, and transactional mutations are mirrored in `transaction_logs` for traceability.

## Phase 3 – Frontend Dashboards

- Seller dashboard refreshed with real-time inventory, order visibility, and logout hygiene.
- Admin dashboard provides overview metrics plus management views for users, sellers, products, and orders.
- Shared navbar reflects role-specific navigation, including admin entry points.

## Phase 4 – Persistence & Data Updates

- MongoDB collections now house all domain entities. Configure `MONGODB_URI` (defaults to `mongodb://127.0.0.1:27017/groceria`) in your `.env` before starting the backend.
- Seller/product flows continue to normalize description fields and enforce numeric pricing validation through the updated Mongoose models.
- Admin seeding keeps environments reproducible (`npm run db:seed-admin`); no SQL migrations or `db:push` steps are required anymore.

## Phase 5 – Testing & Rollout

- Role-aware middlewares guard every surface; inactive users are blocked at login and request time.
- Admin CRUD actions surface inline confirmations (and temporary credentials) in the dashboard.
- Recommended checklist before release: seed the admin, verify Mongo connectivity, exercise role-based logins, and verify Stripe + cancellation flows end-to-end.
