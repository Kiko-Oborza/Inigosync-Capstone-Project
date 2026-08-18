// IñigoSync — Theme Controller (Dark / Light Mode)
// Manages theme state, persistence, and system preference resolution.
// Resolution order: localStorage → prefers-color-scheme → 'dark' (default)
// Dispatches CustomEvent 'themechange' when theme switches, for Chart.js and other listeners.

(function() {
    const STORAGE_KEY = 'inigosync-theme';
    const VALID_THEMES = ['dark', 'light'];

    function getTheme() {
        // 1. Check localStorage
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && VALID_THEMES.includes(saved)) {
            return saved;
        }

        // 2. Check system preference
        if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }

        // 3. Default to dark
        return 'dark';
    }

    function setTheme(theme) {
        if (!VALID_THEMES.includes(theme)) return;

        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);

        // Notify listeners (e.g., Chart.js, other components)
        document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || getTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        setTheme(next);
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTheme(getTheme());
        });
    } else {
        setTheme(getTheme());
    }

    // Expose globally for HTML onclick handlers
    window.ThemeController = {
        toggle: toggleTheme,
        set: setTheme,
        get: () => document.documentElement.getAttribute('data-theme'),
    };
})();
