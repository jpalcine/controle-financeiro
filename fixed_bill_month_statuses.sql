create table if not exists public.fixed_bill_month_statuses (
  id uuid primary key default gen_random_uuid(),
  fixed_bill_id uuid not null references public.fixed_bills(id) on delete cascade,
  month text not null,
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (fixed_bill_id, month)
);

create index if not exists idx_fixed_bill_month_statuses_bill_month
  on public.fixed_bill_month_statuses (fixed_bill_id, month);
