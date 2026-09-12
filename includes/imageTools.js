// IñigoSync — Shared client-side image processing helpers.
// Revision A1 (implementation_plan.md, decisions A5/A9/A6).
//
// Two consumers, two different needs:
//   - downscaleImageToDataUrl(file, {size, quality}) — center-cropped SQUARE
//     JPEG returned as a data: URL, for the two dashboards' profile-photo
//     avatar pipeline (stored directly in profiles.avatar_url — no Storage
//     bucket needed for this one). This is the exact algorithm
//     includes/Dashboard.js's downscaleImageToAvatarDataUrl() already used
//     (R4-4) — that function now just calls this one (see its own comment),
//     so behaviour for the customer dashboard is byte-identical to before
//     this file existed. Validation here matches that original function's
//     own inline checks (any `image/*` type, <= 5 MB) rather than the
//     stricter list below, specifically so moving it here changes nothing
//     about what a customer/owner can pick as an avatar.
//   - downscaleImageToBlob(file, {maxW, maxH, quality}) — aspect-FIT (never
//     cropped, never upscaled) JPEG Blob, for the owner dashboard's Media
//     Manager slideshow and Court Listings photo uploads (A5/A6), which go
//     to the new public Storage bucket `media`
//     (database/schema/015_media_bucket.sql). That bucket's own
//     `allowed_mime_types` is the server-side backstop; the stricter
//     jpeg/png/webp check here is the client-side half of the same rule
//     (implementation_plan.md's security requirements — never rely on the
//     client check alone, but don't make the user wait for a round trip to
//     find out their file type is rejected either).
//
// No build step; plain <script src>, attaches to window like every other
// includes/*.js file. Must load before includes/Dashboard.js and
// includes/owner_dashboard.js (see the <script> order in
// Pages/user_dashboard.html / Pages/owner_dashboard.html).
(function () {
    const MAX_RAW_BYTES = 5 * 1024 * 1024; // 5 MB raw file ceiling, both paths
    const STRICT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    // `strict` true → only jpeg/png/webp (Media Manager/Court photo path,
    // A5/A6). `strict` false → any image/* (avatar path, unchanged from the
    // pre-existing customer dashboard behaviour this file now centralizes).
    function assertValidImageFile(file, strict) {
        if (!file) throw new Error('No file selected.');
        const type = file.type || '';
        const typeOk = strict ? STRICT_TYPES.includes(type) : type.startsWith('image/');
        if (!typeOk) {
            throw new Error(strict ? 'Please choose a JPEG, PNG, or WEBP image.' : 'Please choose an image file.');
        }
        if (file.size > MAX_RAW_BYTES) {
            throw new Error('That image is too large — please choose one under 5 MB.');
        }
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Could not read the selected image.'));
            };
            img.src = objectUrl;
        });
    }

    // Center-cropped SQUARE data URL — ported verbatim from
    // includes/Dashboard.js's original downscaleImageToAvatarDataUrl()
    // (R4-4): the crop SOURCE square is the smaller of the image's own
    // width/height, centered, so a portrait or landscape photo both crop to
    // their visual center instead of being squashed to fit.
    //
    // S4 (Revision A1 fix) — EXIF orientation (e.g. a phone photo shot in
    // portrait but stored upright-pixels + a "rotate" tag) is honoured by
    // <img>/drawImage on Chrome 81+, Safari 13.4+, and Firefox 26+: img's
    // naturalWidth/naturalHeight and everything drawImage() reads below
    // already reflect the correct upright orientation on those engines, no
    // extra correction code needed here. Older browsers ignore the tag and
    // may render/crop a rotated photo (accepted) — downscaleImageToBlob()
    // below reads the same img and inherits this identically.
    async function downscaleImageToDataUrl(file, { size = 256, quality = 0.82 } = {}) {
        assertValidImageFile(file, false);
        const img = await loadImage(file);

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const cropSize = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - cropSize) / 2;
        const sy = (img.naturalHeight - cropSize) / 2;
        ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);

        return canvas.toDataURL('image/jpeg', quality);
    }

    // Aspect-FIT (letterboxed, never cropped) downscale to a Blob, capped at
    // maxW×maxH and never upscaling a smaller source image — for Media
    // Manager slides and Court Listings photos (A5/A6), which are uploaded
    // to the `media` Storage bucket as real files rather than stored as a
    // data: URL (a 1600×900 JPEG is far too large for a `text` column, and
    // Storage is exactly what buckets are for).
    async function downscaleImageToBlob(file, { maxW = 1600, maxH = 900, quality = 0.85 } = {}) {
        assertValidImageFile(file, true);
        const img = await loadImage(file);

        const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Could not process that image.'));
            }, 'image/jpeg', quality);
        });
    }

    window.InigoImageTools = { downscaleImageToDataUrl, downscaleImageToBlob };
})();
