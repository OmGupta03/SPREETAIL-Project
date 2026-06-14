# CSV Ingestion & Multi-Currency Expense Manager

An aesthetically premium, responsive, and robust Expense Management platform built using **Next.js**, **Tailwind CSS**, and **Supabase (PostgreSQL + Auth + Realtime)**. This app supports multi-currency transaction ledgers, currency-specific greedy debt simplifications, and features an interactive CSV uploader that parses, sanitizes, and logs historical data anomalies.

This project was built as an internship assignment with **Antigravity AI** acting as the primary engineering partner.

---

## Key Features

1. **Interactive CSV Ingest Wizard**: Parse standard CSV expense files on the client side, sanitize formatting errors (casing, commas, whitespace, decimals), normalise percentage splits, and reclassify settlement transactions. Shows a beautiful, interactive **Import Report** panel with all warnings and resolutions.
2. **Decoupled User Profiles**: Allows importing historical CSV participants (like Aisha, Rohan, Priya, Meera, Dev, Sam, Kabir) with random UUIDs and optional email addresses. Users can sign up later and sync cleanly, resolving the strict auth bottleneck.
3. **Multi-Currency Ledgers & Settlements**: Full native support for `INR` (Indian Rupees) and `USD` (US Dollars). Expenses and payments are stored in their native currency, preventing exchange-rate distortion.
4. **Greedy Debt Simplification per Currency**: Run debt minimization separately for USD and INR, providing accurate simplified balance paths for each currency ledger (e.g. A owes B $20 USD and ₹5,000 INR).
5. **Real-time Discussion Chat**: Discuss specific ledger entries in real-time inside the slide-out expense details drawer using Supabase Realtime client listeners.
6. **Negative Refund Splits**: Negative expense values are supported natively (e.g., `-30 USD` for canceled bookings), correctly reducing split debts.

---

## Tech Stack

* **Frontend/Backend Framework**: Next.js 16 (App Router)
* **Styling**: Tailwind CSS v4 (configured via postCSS)
* **Database**: PostgreSQL (Supabase)
* **Authentication**: Supabase Auth (JWT)
* **Real-time Sync**: Supabase Realtime subscriptions
* **Hosting**: Vercel

---

## Setup Instructions

### 1. Database Configuration (Supabase)
1. Create a project on [Supabase](https://supabase.com).
2. Go to the **SQL Editor** tab in your Supabase dashboard.
3. Copy the contents of [`schema.sql`](file:///c:/Users/91904/Desktop/SpreeTail/schema.sql) and run it. This will build all required tables, indexes, and triggers. If you have an existing database, run the `ALTER` migration block at the top of `schema.sql`.
4. Retrieve your `Project URL` and `anon public key` from **Project Settings** -> **API**.

### 2. Environment Setup
1. Create a `.env.local` file in the root of the project:
   ```bash
   cp .env.example .env.local
   ```
2. Populate `.env.local` with your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url-here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here
   ```

### 3. Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Documentation

* **[`SCOPE.md`](file:///c:/Users/91904/Desktop/SpreeTail/SCOPE.md)**: Anomaly log of all CSV data problems (like percentage mismatch, date formats, blanks, duplicates) and how they are handled, along with the database schema.
* **[`DECISIONS.md`](file:///c:/Users/91904/Desktop/SpreeTail/DECISIONS.md)**: A decision log detailing architecture choices, options considered, and rationales (decoupling users, multi-currency isolation, client parsing).
* **[`AI_USAGE.md`](file:///c:/Users/91904/Desktop/SpreeTail/AI_USAGE.md)**: AI tools used, prompts, and 3 concrete cases where the AI made a mistake, how it was caught, and how it was corrected.
* **[`schema.sql`](file:///c:/Users/91904/Desktop/SpreeTail/schema.sql)**: Database tables, constraints, indexes, and triggers.
