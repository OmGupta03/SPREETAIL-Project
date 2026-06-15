-- PostgreSQL Database Schema for PayBack & Expense Manager (Updated)
-- Paste this script into your Supabase SQL Editor and run it.

-- =========================================================================
-- MIGRATION PATH FOR EXISTING MVP SCHEMAS:
-- If you already have tables, run these alter statements to update them:
-- =========================================================================
-- 1. Remove references auth.users constraint to allow unregistered members
-- ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
-- ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
-- 2. Add currency column and remove positive amount constraint in expenses
-- ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';
-- ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_amount_check;
-- 3. Add currency column in settlements
-- ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';
-- =========================================================================

-- 1. Create Public Users Profile Table (decoupled from auth.users to allow unregistered members from CSV)
create table if not exists public.users (
    id uuid default gen_random_uuid() primary key,
    email text unique, -- Nullable because unregistered members don't have emails in the CSV
    name text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Groups Table
create table if not exists public.groups (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Group Members Join Table
create table if not exists public.group_members (
    group_id uuid references public.groups(id) on delete cascade,
    user_id uuid references public.users(id) on delete cascade,
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (group_id, user_id)
);

-- 4. Create Expenses Table (with currency support, allowing zero/refunds)
create table if not exists public.expenses (
    id uuid default gen_random_uuid() primary key,
    group_id uuid references public.groups(id) on delete cascade not null,
    paid_by uuid references public.users(id) on delete set null,
    description text not null,
    amount numeric(12, 2) not null,
    currency text not null default 'INR',
    split_type text not null check (split_type in ('equal', 'unequal', 'percentage', 'share')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Create Expense Splits Table
create table if not exists public.expense_splits (
    id uuid default gen_random_uuid() primary key,
    expense_id uuid references public.expenses(id) on delete cascade not null,
    user_id uuid references public.users(id) on delete cascade not null,
    amount numeric(12, 2) not null,
    percentage numeric(5, 2),
    share numeric(10, 2)
);

-- 6. Create Settlements Table (with currency support)
create table if not exists public.settlements (
    id uuid default gen_random_uuid() primary key,
    group_id uuid references public.groups(id) on delete cascade not null,
    payer_id uuid references public.users(id) on delete set null not null,
    payee_id uuid references public.users(id) on delete set null not null,
    amount numeric(12, 2) not null check (amount > 0),
    currency text not null default 'INR',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    check (payer_id <> payee_id)
);

-- 7. Create Chat Messages Table
create table if not exists public.chat_messages (
    id uuid default gen_random_uuid() primary key,
    expense_id uuid references public.expenses(id) on delete cascade not null,
    user_id uuid references public.users(id) on delete cascade not null,
    message text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Realtime for Chat Messages
alter publication supabase_realtime add table public.chat_messages;

-- Create Indexes for Query Optimization
create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_group_members_group on public.group_members(group_id);
create index if not exists idx_expenses_group on public.expenses(group_id);
create index if not exists idx_expense_splits_expense on public.expense_splits(expense_id);
create index if not exists idx_expense_splits_user on public.expense_splits(user_id);
create index if not exists idx_settlements_group on public.settlements(group_id);
create index if not exists idx_chat_messages_expense on public.chat_messages(expense_id);

-- Disable Row Level Security on all tables for rapid prototyping
alter table public.users disable row level security;
alter table public.groups disable row level security;
alter table public.group_members disable row level security;
alter table public.expenses disable row level security;
alter table public.expense_splits disable row level security;
alter table public.settlements disable row level security;
alter table public.chat_messages disable row level security;

-- Create a Trigger to Automatically Sync Auth Users to Public Users Table
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.users (id, email, name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
    );
    return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists, then create it
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
