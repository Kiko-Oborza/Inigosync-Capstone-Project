-- Cover the auth-user foreign key for account deletion/cascade checks.
create index if not exists booking_review_customer_id_idx
    on public.booking_review (customer_id);
