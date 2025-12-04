# Groceria

The project now ships with a staged roadmap that covers the full migration from a single-role storefront to a role-aware commerce platform.

## Phase 1 – Role Model & Auth

- PostgreSQL schema introduces user roles (`customer`, `seller`, `admin`) plus dedicated seller metadata.
- JWT middleware verifies role + active status for every request.
- Admin seeding script (`npm run db:seed-admin`) provisions the first admin via `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` environment variables.

## Phase 2 – Backend Endpoints

- Admin API can create/promote sellers, toggle user activity, archive products, and cancel or delete orders.
- Seller APIs are constrained to owned products; orders surfaced per seller.
- Every privileged change is written to an `admin_audit_logs` table for traceability.

## Phase 3 – Frontend Dashboards

- Seller dashboard refreshed with real-time inventory, order visibility, and logout hygiene.
- Admin dashboard provides overview metrics plus management views for users, sellers, products, and orders.
- Shared navbar reflects role-specific navigation, including admin entry points.

## Phase 4 – Migrations & Data Updates

- Database migration `002_admin_controls.sql` deploys new columns (`is_active`, `is_archived`, `cancelled_at`, etc.).
- Seller/product seed flows normalize description fields and enforce numeric pricing validation.
- Admin seeding + SQL migrations keep environments reproducible.

## Phase 5 – Testing & Rollout

- Role-aware middlewares guard every surface; inactive users are blocked at login and request time.
- Admin CRUD actions surface inline confirmations (and temporary credentials) in the dashboard.
- Recommended checklist before release: run migrations, seed the admin, exercise role-based logins, and verify Stripe + cancellation flows end-to-end.