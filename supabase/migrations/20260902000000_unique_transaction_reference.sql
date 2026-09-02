create unique index if not exists registrations_transaction_reference_unique_idx
  on public.registrations (lower(btrim(transaction_reference)));
