# AHMS Hospital Management

A role-based hospital management web app. The Express API serves the frontend and protects patient records and hospital workflows with authenticated role-based access control.

## Run locally

Requirements: Node.js 24 and a Supabase project.

```powershell
cd backend
npm install
Copy-Item .env.example .env
# Edit .env and set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
npm start
```

Before starting, review and run [`backend/schema.sql`](backend/schema.sql) in the Supabase SQL Editor. Back up the database first; this schema adds clinical workflow tables and removes the public patient-registration function. In development, an empty database is seeded with demo records and accounts; demo credentials are documented in [backend/README.md](backend/README.md) and must not be used in production. Keep the Supabase service-role key on the server only; never put it in frontend code.

To import existing data from the local SQLite database, configure the Supabase environment variables in `backend/.env` and run this once from the `backend` folder after installing the schema:

```powershell
npm run migrate:sqlite
```

The importer defaults to `backend/acms.db`, can be pointed at another file with `SQLITE_PATH`, preserves existing IDs, skips the four bundled demo accounts, and refuses to merge into non-empty Supabase tables. It does not delete or modify the SQLite source file. Back up both databases before migrating real records.

## Deploy on Render

1. Create a Supabase project and choose a region near your Render service. In **SQL Editor → New query**, paste and run [`backend/schema.sql`](backend/schema.sql). The script enables RLS and creates no public policies.
2. In Supabase, copy the **Project URL** and **service-role key** from the API settings. Keep the service-role key private; it bypasses row-level security and belongs only in the backend environment.
3. Push this repository to GitHub. Do not commit `.env` files or database files.
4. In Render, choose **New > Blueprint** and connect the repository. Render reads `render.yaml` at the repository root.
5. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, a unique `ADMIN_EMAIL`, and `ADMIN_PASSWORD` (12+ characters), and let Render generate `JWT_SECRET`. Startup creates this Admin if that email is not already an Admin. These values are stored as Render environment secrets, not in GitHub.
6. Deploy. The service connects to Supabase and checks `/api/health`; no Render disk is needed for database persistence.
7. Open `/admin` for the separate administrator portal and sign in with the configured administrator credential in the PIN field. Change it to a unique 8-digit PIN from the account controls. Admins create staff accounts and securely provide each new staff member's one-time generated PIN. The general hospital login does not accept Admin accounts. There is no patient self-registration or patient portal.

This project is a staged prototype, not a clinically validated, certified, or standards-compliant hospital information system. ESI is manually assigned; NEWS2 is experimental Scale 1-only decision support and must not replace clinical judgment or local escalation protocols. Medication catalogs, allergy classes, lab reference intervals, and critical limits must be validated by qualified staff. Do not use the prototype for real clinical decisions or patient care. Before any real use, conduct clinical safety, security, privacy, operational, and regulatory reviews; validate workflows and data; and establish backup and incident-response procedures.

## Roles

- **Admin:** hospital dashboard, patient records, appointments, billing, inventory, account management, and audit activity.
- **Doctor:** assigned patient records, SOAP/ICD-10 notes, prescriptions, lab ordering, critical-result acknowledgment, triage visibility, and clinical dashboard.
- **Receptionist:** patient registration, appointments, billing, and front-desk dashboard.
- **Nurse:** patient records, appointments, triage, observations, lab ordering, and ward admissions.
- **Pharmacist:** medication catalog, pending prescriptions, dispensing, and stock.
- **Lab:** laboratory orders and result entry.

Staff roles are assigned by an Admin; users do not choose their own role. Admins use the separate `/admin` portal. The API enforces portal access and role permissions independently of the frontend. Staff sessions expire after 10 minutes of inactivity.
Authenticated API reads and clinical/administrative changes are attributed to the acting staff account in the audit log.

## Prototype clinical workflows

- Staff register patients with an MRN; matching name and date-of-birth records trigger an identity-verification warning.
- ESI triage levels are assigned by staff and shown in urgency order. The app does not calculate ESI.
- NEWS2 is prototype-only, uses Scale 1, and is not clinically validated.
- Clinical notes use SOAP sections and an ICD-10 code field; code format checks do not validate clinical coding.
- Prescribing checks catalogued allergy terms/classes and pending duplicate active ingredients. Missing or inaccurate catalog data can defeat these checks.
- Lab results show reference intervals and flags. Critical results remain in clinician alerts until a doctor acknowledges them.
- Pharmacy dispensing and admissions enforce stock/ward capacity through database functions.
- Billing uses a fee schedule: the registration card (UGX 10,000, once) and consultation (UGX 25,000, every visit) are charged automatically; diagnostics, medicine and bed space are charged as services are delivered; surgery is added by billing staff. Invoices are itemised, payment is refused while a compulsory fee is missing, and only an Administrator can waive a charge (with a reason). The Administrator must enter prices for tests, medicines, wards and procedures in **Fee schedule**.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (Render supplies this automatically) |
| `NODE_ENV` | Use `production` when deployed; prevents seeding demo credentials |
| `SUPABASE_URL` | Supabase project URL; required to start |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key; required to start |
| `JWT_SECRET` | Required in production; Render generates a random secret |
| `ADMIN_EMAIL` | Production bootstrap administrator email; if it does not exist, startup creates it |
| `ADMIN_PASSWORD` | Initial production administrator password (12+ characters); existing Admin passwords are not overwritten |
| `FRONTEND_ORIGIN` | Optional allowed browser origin when hosting the frontend separately; by default the API serves it from the same origin |

See [backend/README.md](backend/README.md) for the API reference and local demo credentials.
