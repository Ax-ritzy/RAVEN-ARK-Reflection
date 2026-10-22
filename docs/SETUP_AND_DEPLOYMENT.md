# Setup and Deployment Guide

## 1. Supabase Project Setup (Dashboard & CLI)

Since direct API project creation requires a personal access token (`SUPABASE_ACCESS_TOKEN`), follow these steps in the Supabase Dashboard:

### Step 1.1: Create the Supabase Project
1. Log in to [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Click **New project** and select your organization.
3. Configure the project:
   - **Name:** `reflection-ai-assessment`
   - **Database Password:** Generate and securely save a strong password.
   - **Region:** Select the region closest to your users (e.g., `ap-south-1` Mumbai or `us-east-1`).
   - **Pricing Plan:** Free tier or Pro tier.
4. Click **Create new project** and wait ~2 minutes for provisioning to finish.

### Step 1.2: Obtain Project API Credentials
1. In your project dashboard, navigate to **Project Settings** -> **API**.
2. Copy the following values into your root `.env` and portal `.env.local` files:
   - **Project URL:** `https://<project-ref>.supabase.co` -> `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key:** `eyJ...` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key:** `eyJ...` -> `SUPABASE_SERVICE_ROLE_KEY` *(Server-only!)*
3. Navigate to **Project Settings** -> **Database** and copy the Connection String URI for `DATABASE_URL`.

### Step 1.3: Run Database Migrations
You can execute migrations in order using the Supabase **SQL Editor**:
1. Copy contents of `database/migrations/001_initial_schema.sql` and run it.
2. Copy contents of `database/migrations/002_rls_policies.sql` and run it.
3. Copy contents of `database/migrations/003_storage_buckets.sql` and run it.
4. (Optional) Run `database/seed/seed_data.sql` to populate initial test data.

Alternatively, via Supabase CLI:
```bash
npx supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
```

---

## 2. Local Development Setup

### Backend (FastAPI Assessment Engine)
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Student Portal (Next.js)
```bash
cd student-portal
npm install
npm run dev
# Running on http://localhost:3000
```

### Professor Admin Portal (Next.js)
```bash
cd professor-portal
npm install
npm run dev -- -p 3001
# Running on http://localhost:3001
```

---

## 3. Production Deployment (Vercel)

Both portals can be deployed to Vercel as two separate projects pointing to the same GitHub repository:

### Student Portal Deployment:
- **Root Directory:** `student-portal`
- **Environment Variables:**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `FASTAPI_BACKEND_URL` (URL of your deployed FastAPI service)

### Professor Admin Portal Deployment:
- **Root Directory:** `professor-portal`
- **Environment Variables:**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (Keep secret, server-only)
  - `FASTAPI_BACKEND_URL`
  - `INTERNAL_API_SECRET_KEY`

### FastAPI Backend Deployment:
- Deploy to Railway, Render, Fly.io, or AWS Lambda/App Runner with Python 3.11+.
