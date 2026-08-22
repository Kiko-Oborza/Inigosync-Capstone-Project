// IñigoSync — Owner Dashboard: Booking Trends Chart (Chart.js)
// Renders the single Weekly/Monthly-toggleable booking trend bar graph
// shown on the Booking Overview panel of Pages/owner_dashboard.html.
//
// Real data: counts real rows from the `booking` table, grouped by day
// (last 7 days) or by month (last 8 months) client-side — there's no SQL
// aggregation available without a view/RPC, and none exists, so grouping
// happens in JS over the raw `time_date` values.
//
// Colors are read dynamically from CSS custom properties and updated on theme change.

let bookingChart = null;
let currentChartRange = 'week';

function emptyRange(labels, unit) {
    return { labels, values: labels.map(() => 0), total: 0, unit };
}

let CHART_DATA = {
    week: emptyRange(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'bookings per day · last 7 days'),
    month: emptyRange(['—'], 'bookings per month'),
};

function aggregateWeek(rows) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (6 - i));
        return d;
    });

    const labels = days.map((d) => d.toLocaleDateString('en-US', { weekday: 'short' }));
    const values = days.map((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        return rows.filter((r) => {
            const t = new Date(r.time_date);
            return t >= d && t < next;
        }).length;
    });

    return { labels, values, total: values.reduce((a, b) => a + b, 0), unit: 'bookings per day · last 7 days' };
}

function aggregateMonth(rows) {
    const now = new Date();
    const months = Array.from({ length: 8 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (7 - i), 1));

    const labels = months.map((d) => d.toLocaleDateString('en-US', { month: 'short' }));
    const values = months.map((d) => rows.filter((r) => {
        const t = new Date(r.time_date);
        return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
    }).length);

    return { labels, values, total: values.reduce((a, b) => a + b, 0), unit: `bookings per month · ${now.getFullYear()}` };
}

async function loadChartData() {
    if (!window.sb) return;
    const { data, error } = await window.sb.from('booking').select('time_date');
    if (error || !data) {
        console.error('[admin-chart] failed to load bookings', error);
        return;
    }
    CHART_DATA = { week: aggregateWeek(data), month: aggregateMonth(data) };
}

function getThemeColors() {
    const root = document.documentElement;
    const style = getComputedStyle(root);

    return {
        ink: style.getPropertyValue('--color-ink').trim(),
        inkFaint: style.getPropertyValue('--color-ink-faint').trim(),
        line: style.getPropertyValue('--color-line').trim(),
        primary: style.getPropertyValue('--color-primary').trim(),
        primaryDim: style.getPropertyValue('--color-primary-dim').trim(),
        bgCard: style.getPropertyValue('--color-bg-card').trim(),
    };
}

function baseOptions(colors) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: colors.bgCard,
                borderColor: colors.line,
                borderWidth: 1,
                titleColor: colors.ink,
                bodyColor: colors.ink,
                padding: 10,
                displayColors: false,
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: colors.inkFaint, font: { size: 11 } },
            },
            y: {
                beginAtZero: true,
                grid: { color: colors.line },
                ticks: { color: colors.inkFaint, font: { size: 11 }, precision: 0 },
            },
        },
    };
}

// Re-applies current theme colors to the existing chart instance (called on
// 'themechange' so the graph flips light/dark without a full re-render).
function updateCharts() {
    if (!bookingChart) return;

    const colors = getThemeColors();

    bookingChart.data.datasets[0].backgroundColor = colors.primary;
    bookingChart.data.datasets[0].hoverBackgroundColor = colors.primaryDim;
    bookingChart.options.plugins.tooltip.backgroundColor = colors.bgCard;
    bookingChart.options.plugins.tooltip.borderColor = colors.line;
    bookingChart.options.plugins.tooltip.titleColor = colors.ink;
    bookingChart.options.plugins.tooltip.bodyColor = colors.ink;
    bookingChart.options.scales.x.ticks.color = colors.inkFaint;
    bookingChart.options.scales.y.grid.color = colors.line;
    bookingChart.options.scales.y.ticks.color = colors.inkFaint;
    bookingChart.update();
}

// Updates the "total {N}" label, the unit caption under the title, and the
// active/inactive styling on the Weekly/Monthly pill toggle.
function renderChartMeta() {
    const src = CHART_DATA[currentChartRange];

    const unitEl = document.querySelector('[data-admin-chart-unit]');
    const totalEl = document.querySelector('[data-admin-chart-total]');
    if (unitEl) unitEl.textContent = src.unit;
    if (totalEl) totalEl.textContent = src.total;

    document.querySelectorAll('[data-admin-chart-range]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.adminChartRange === currentChartRange);
    });
}

function setChartRange(range) {
    if (!CHART_DATA[range]) return;
    currentChartRange = range;

    renderChartMeta();

    if (bookingChart) {
        const src = CHART_DATA[range];
        bookingChart.data.labels = src.labels;
        bookingChart.data.datasets[0].data = src.values;
        bookingChart.update();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof Chart === 'undefined') {
        console.warn('[admin-chart] Chart.js failed to load from the CDN.');
        return;
    }

    const colors = getThemeColors();

    Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
    Chart.defaults.color = colors.inkFaint;

    // ------------------------------------------------------------------
    // Booking Trends — single bar chart, toggled between Weekly / Monthly.
    // ------------------------------------------------------------------
    const canvas = document.getElementById('adminBookingChart');
    if (canvas) {
        const src = CHART_DATA[currentChartRange];

        bookingChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: src.labels,
                datasets: [{
                    label: 'Bookings',
                    data: src.values,
                    backgroundColor: colors.primary,
                    hoverBackgroundColor: colors.primaryDim,
                    borderRadius: 6,
                    maxBarThickness: 42,
                }],
            },
            options: baseOptions(colors),
        });
    }

    renderChartMeta();

    // Weekly / Monthly pill toggle — swaps the dataset in place.
    document.querySelectorAll('[data-admin-chart-range]').forEach((btn) => {
        btn.addEventListener('click', () => setChartRange(btn.dataset.adminChartRange));
    });

    // Listen for theme changes and re-color the chart.
    document.addEventListener('themechange', () => {
        updateCharts();
    });

    // Real booking counts load once the signed-in profile is confirmed
    // (RLS needs an authenticated session), then refresh the chart in place.
    async function refreshChartData() {
        await loadChartData();
        setChartRange(currentChartRange);
    }
    document.addEventListener('inigosync:profile-ready', refreshChartData);
    if (window.inigosyncProfile) refreshChartData();
});
