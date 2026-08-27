// IñigoSync — Shared HTML-escaping helper.
//
// The ONE place untrusted text is allowed to become HTML, for every page.
// Customer/staff-controlled data (a booking's customer name, a staff
// member's name/email/position, a court label, etc.) can reach innerHTML
// across the landing page and all three dashboards. A name like
// `<img src=x onerror=alert(1)>` must render as literal text everywhere,
// not run — so every interpolated value that reaches innerHTML goes
// through this first.
//
// This used to be defined locally inside includes/landingPage.js. It's
// pulled out here so the three dashboard controllers (staff_dashboard.js,
// owner_dashboard.js, Dashboard.js) can use the exact same implementation
// instead of leaving it unapplied — see docs/QA_AUDIT_REPORT.md P2#1.
//
// This project ships plain <script src> tags (no build step, no ES
// modules), so this attaches to window. Load this before any script that
// calls window.escapeHtml — landingPage.js and all three dashboard
// controllers already do.
(function () {
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, (ch) => {
            switch (ch) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return ch;
            }
        });
    }

    window.escapeHtml = escapeHtml;
})();
