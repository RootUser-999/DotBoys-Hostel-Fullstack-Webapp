# DOT BOYS HOSTEL — Hostel Management, Online Booking & CMS Platform

Production web application for **DOT BOYS HOSTEL**, Building # D-399, Main 6th Road, Opposite Noor Mobile Mall, Satellite Town, Rawalpindi, Pakistan.

## Architecture (Running Live Stack)
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, TanStack Query, React Hook Form + Zod, Lucide Icons, jsPDF (PDF receipts & reports)
- **Backend**: Node.js 22, Express 4, TypeScript (`tsx`), JWT + HttpOnly cookies, Scrypt password hashing, Multer file uploads, Nodemailer SMTP, Official Meta WhatsApp Business Cloud API v21.0
- **Database**: Persistent SQLite relational database (`node:sqlite`, WAL mode, `PRAGMA foreign_keys = ON`, `BEGIN IMMEDIATE` transactional bed locking) at `./data/dotboys.db`

## Initial Admin Handover Procedure
1. Open `/admin/login`
2. Sign in with bootstrap username (`ADMIN_BOOTSTRAP_USERNAME`, default `dotboys`) and temporary password (`ADMIN_BOOTSTRAP_PASSWORD`, default `admin`).
3. You will be prompted immediately to change the temporary password before accessing resident or financial modules.

## Environment Variables
Copy `.env.example` to `.env` and configure:
- `JWT_SECRET` (strong random secret)
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` (Meta Graph API v21.0)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (optional email notifications)

## Verification & Tests
- `npm test` — Runs `node:test` suites for billing math, reminder eligibility, occupancy calculations, and database transactional invariants.
- `npm run lint` — TypeScript strict type-checking.
- `npm run build` — Production Vite bundle build.
