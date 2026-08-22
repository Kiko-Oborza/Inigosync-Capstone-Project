// Session + role guard for the 3 dashboards, plus shared logout wiring.
// Reads the required role from <body data-required-role="customer|staff|admin">.
// Actual data access is still enforced server-side by RLS — this only avoids
// showing the wrong dashboard shell to a signed-in user of the wrong role.
document.addEventListener('DOMContentLoaded', async () => {
    if (window.InigoLoading) window.InigoLoading.show('Loading your dashboard…');

    if (!window.sb) {
        console.error('[authGuard] Supabase client (window.sb) is not available.');
        return;
    }

    const requiredRole = document.body.dataset.requiredRole;
    const dashboardByRole = {
        customer: '../Pages/user_dashboard.html',
        staff: '../Pages/staff_dashboard.html',
        admin: '../Pages/owner_dashboard.html'
    };

    function goToLogin() {
        window.location.assign(new URL('../Pages/Index.html', window.location.href).toString());
    }

    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) {
        goToLogin();
        return;
    }

    const { data: profile, error } = await window.sb
        .from('profiles')
        .select('id, role, full_name, email, status, contact_num, position, avatar_url')
        .eq('id', session.user.id)
        .single();

    if (error || !profile || profile.status === 'disabled') {
        await window.sb.auth.signOut();
        goToLogin();
        return;
    }

    if (requiredRole && profile.role !== requiredRole) {
        const redirectUrl = dashboardByRole[profile.role];
        window.location.assign(new URL(redirectUrl || '../Pages/Index.html', window.location.href).toString());
        return;
    }

    window.inigosyncProfile = profile;
    if (window.InigoLoading) window.InigoLoading.hide();
    document.documentElement.classList.remove('inigo-auth-pending');
    document.dispatchEvent(new CustomEvent('inigosync:profile-ready', { detail: profile }));

    async function logout() {
        await window.sb.auth.signOut();
        goToLogin();
    }

    document.querySelectorAll('[data-dash-logout], [data-staff-logout], [data-admin-logout]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });
});
