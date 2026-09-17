// Landing-page illustration lookup and URL validation. Published database photos
// remain authoritative; only invalid or unsafe URL schemes are rejected.
(() => {
    const sports = ['basketball', 'badminton', 'bowling', 'billiards', 'lawn-tennis', 'pickleball', 'table-tennis', 'volleyball'];
    window.InigoVisuals = Object.freeze({
        sportIndex(slug) { return sports.indexOf(slug); },
        venuePhoto(value) {
            if (!value || typeof value !== 'string') return null;
            try {
                const url = new URL(value, document.baseURI);
                if (!['http:', 'https:'].includes(url.protocol)) return null;
                return url.href;
            } catch { return null; }
        },
    });
})();
