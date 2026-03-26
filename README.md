# ZapOkay — Sprint 1

Bilingual (FR/EN) corporate minute book SaaS for Québec SMBs.

## Stack
- **Next.js 14** (App Router) + TypeScript
- **Supabase** (Auth + PostgreSQL + RLS)
- **Tailwind CSS**
- **next-intl** (i18n)
- **Vercel** (deployment)

## Quick Start

### 1. Clone and install
```bash
git clone <your-repo-url>
cd zapokay
npm install
```

### 2. Set up environment variables
```bash
cp .env.local.example .env.local
```
Edit `.env.local` with your values:
```
NEXT_PUBLIC_SUPABASE_URL=https://xakrgttmndgshkltbxzj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run database schema
Open Supabase Dashboard → SQL Editor → paste and run `supabase/schema.sql`

### 4. Configure Supabase Auth
In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `http://localhost:3000` (or your Vercel URL)
- Redirect URLs: add `http://localhost:3000/api/auth/callback` and your Vercel URL

### 5. Run locally
```bash
npm run dev
```

## Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```
Add env vars in Vercel Dashboard → Project → Settings → Environment Variables.

## Project Structure
```
app/
  [locale]/          # All routes prefixed with /fr or /en
    login/           # Sign in page
    signup/          # Create account page
    onboarding/      # 4-step onboarding flow
    dashboard/       # Main dashboard
  api/auth/callback/ # Supabase auth callback
components/
  auth/              # LoginForm, SignupForm
  onboarding/        # Step components
  dashboard/         # Shell + WelcomeCard
  ui/                # Button, Input, Select, ZapLogo
lib/
  supabase/          # client.ts + server.ts
  types.ts           # TypeScript types
  utils.ts           # cn(), formatDate()
messages/
  fr.json            # French strings
  en.json            # English strings
supabase/
  schema.sql         # Full DB schema + RLS + seed data
```

## Sprint 2 Roadmap
- Compliance item generation per company
- Resolution templates (LSA + CBCA)
- Document upload (Supabase Storage)
- Annual reminder email system
- Settings page (company + user profile edit)
