// IñigoSync — Owner Dashboard: Booking Trend Charts (Chart.js)
// Renders the Weekly / Monthly booking trend bar graphs shown on the
// Booking Overview panel of Pages/admin_dashboard.html.
//
// UI/demo only — the arrays below are placeholder figures. Once the
// backend (PHP/MySQL) is ready, replace WEEKLY_DATA / MONTHLY_DATA with a
// fetch() call to an endpoint such as GET /api/admin/booking-trends and
// feed the response into the same chart.data.datasets[0].data arrays.

document.addEventListener('DOMContentLoaded', () => {
    if (typeof Chart === 'undefined') {
        console.warn('[admin-chart] Chart.js failed to load from the CDN.');
        return;
    }

    // Shared look & feel so both charts match the IñigoSync dark theme.
    const INK = '#c9c2b4';
    const INK_FAINT = '#8a8177';
    const LINE = 'rgba(244, 239, 230, 0.12)';
    const PRIMARY = '#ff6a2c';
    const PRIMARY_DIM = 'rgba(255, 106, 44, 0.35)';
    const COURT_GREEN = '#3e7a5e';

    Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
    Chart.defaults.color = INK_FAINT;

    function baseOptions(yLabel) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#201a14',
                    borderColor: LINE,
                    borderWidth: 1,
                    titleColor: '#f4efe6',
                    bodyColor: INK,
                    padding: 10,
                    displayColors: false,
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: INK_FAINT, font: { size: 11 } },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: LINE },
                    ticks: { color: INK_FAINT, font: { size: 11 }, precision: 0 },
                    title: { display: !!yLabel, text: yLabel, color: INK_FAINT, font: { size: 11 } },
                },
            },
        };
    }

    // ------------------------------------------------------------------
    // Weekly Booking Trends — bookings per day, current week.
    // ------------------------------------------------------------------
    const weeklyCanvas = document.getElementById('adminWeeklyChart');
    if (weeklyCanvas) {
        const WEEKLY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const WEEKLY_DATA = [9, 12, 8, 14, 17, 23, 19];

        new Chart(weeklyCanvas, {
            type: 'bar',
            data: {
                labels: WEEKLY_LABELS,
                datasets: [{
                    label: 'Bookings',
                    data: WEEKLY_DATA,
                    backgroundColor: PRIMARY_DIM,
                    hoverBackgroundColor: PRIMARY,
                    borderRadius: 6,
                    maxBarThickness: 36,
                }],
            },
            options: baseOptions('Bookings'),
        });
    }

    // ------------------------------------------------------------------
    // Monthly Booking Trends — total bookings per month, current year.
    // ------------------------------------------------------------------
    const monthlyCanvas = document.getElementById('adminMonthlyChart');
    if (monthlyCanvas) {
        const MONTHLY_LABELS = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
        const MONTHLY_DATA = [64, 71, 88, 96, 110, 132];

        new Chart(monthlyCanvas, {
            type: 'bar',
            data: {
                labels: MONTHLY_LABELS,
                datasets: [{
                    label: 'Bookings',
                    data: MONTHLY_DATA,
                    backgroundColor: 'rgba(62, 122, 94, 0.45)',
                    hoverBackgroundColor: COURT_GREEN,
                    borderRadius: 6,
                    maxBarThickness: 42,
                }],
            },
            options: baseOptions('Bookings'),
        });
    }
});