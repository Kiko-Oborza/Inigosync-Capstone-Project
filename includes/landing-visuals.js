// Presentation assets only. This does not change court records or their photos.
// The owner requested photo placeholders until actual venue photos are supplied.
// These four uploads were visually checked on 2026-09-17 and contain portraits.
// New uploads continue to appear automatically; no database rows are modified.
(() => {
    const demoUploads = new Set([
        'basketball-1789221827280.jpg',
        '063f4381-fb52-4806-a9fb-f743d45d5447-1789221710087.jpg',
        'cf71215b-0d72-4606-97d0-599fd70f4a42-1789221721655.jpg',
        'd86a2290-0a29-4e0f-b0f9-e9915eb71feb-1789221731923.jpg',
    ]);
    const sports = ['basketball', 'badminton', 'bowling', 'billiards', 'lawn-tennis', 'pickleball', 'table-tennis', 'volleyball'];
    window.InigoVisuals = Object.freeze({
        sportIndex(slug) { return sports.indexOf(slug); },
        venuePhoto(value) {
            if (!value || typeof value !== 'string') return null;
            try {
                const url = new URL(value, document.baseURI);
                if (!['http:', 'https:'].includes(url.protocol)) return null;
                if (url.pathname.includes('/database/web/')) return null;
                if (demoUploads.has(url.pathname.split('/').pop())) return null;
                return url.href;
            } catch { return null; }
        },
    });
})();
