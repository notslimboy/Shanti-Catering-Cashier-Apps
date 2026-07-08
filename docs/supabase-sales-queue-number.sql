alter table public.sales add column if not exists queue_no integer;
alter table public.sales add column if not exists queue_date date;

create index if not exists idx_sales_queue_date_no
  on public.sales(queue_date, queue_no);
