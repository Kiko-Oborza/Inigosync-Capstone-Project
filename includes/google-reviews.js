// Keep the existing testimonials until a real widget ID is configured.
document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector('[data-google-reviews]');
    const id = window.InigoGoogleReviews?.widgetId;
    if (!host || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;

    const testimonials = document.querySelector('[data-testimonial-grid]');
    if (testimonials) testimonials.hidden = true;
    const disclosure = document.querySelector('[data-testimonial-disclosure]');
    if (disclosure) disclosure.textContent = 'Discover what visitors are saying about Iñigos Sports Center on Google.';
    const note = document.querySelector('[data-google-reviews-note]');
    if (note) note.hidden = false;
    const fallback = document.querySelector('[data-google-reviews-fallback]');
    if (fallback) fallback.hidden = true;
    host.hidden = false;
    const widget = document.createElement('div');
    widget.className = 'elfsight-app-' + id;
    widget.setAttribute('data-elfsight-app-lazy', '');
    host.append(widget);

    const script = document.createElement('script');
    script.src = 'https://elfsightcdn.com/platform.js';
    script.async = true;
    script.addEventListener('error', () => {
        host.hidden = true;
        if (note) note.hidden = true;
        if (fallback) fallback.hidden = false;
    }, { once: true });
    document.head.append(script);
});
