// Shared Supabase client for all pages. Requires the supabase-js CDN script
// to be loaded first:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
//   <script src="../Config/supabaseClient.js"></script>
//
// The publishable/anon key below is safe to expose in client-side code — it
// only grants what the database's row level security policies allow. Never
// put the service_role key here or anywhere in frontend code.
(function () {
    const SUPABASE_URL = 'https://xrlwtnwamboucihsamrr.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Q4GdiCyw7ne6mn8ZY4K8hA_whVQXkqq';

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.error('[supabaseClient] supabase-js failed to load before Config/supabaseClient.js');
        return;
    }

    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.SUPABASE_URL = SUPABASE_URL;
})();
