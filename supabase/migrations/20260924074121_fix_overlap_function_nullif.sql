-- The first live deployment of prevent_reservation_overlap used
-- pg_catalog.nullif, but NULLIF is SQL syntax rather than a callable
-- pg_catalog function. Recompile its definition with the correct spelling.
-- Fresh installations already receive the corrected definition above.
do $$
begin
  execute replace(
    pg_get_functiondef('internal.prevent_reservation_overlap()'::regprocedure),
    'pg_catalog.nullif',
    'nullif'
  );
end $$;
