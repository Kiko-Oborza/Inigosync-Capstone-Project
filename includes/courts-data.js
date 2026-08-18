// IñigoSync — Shared Courts & Facilities Inventory
// Single source of truth for all sports, equipment counts, and unit types.
// Used by landing page, customer dashboard, staff dashboard, and admin dashboard.
//
// TODO: replace with SELECT from `courts` table (PHP/MySQL)

const COURTS_INVENTORY = [
    {
        id: 'basketball',
        name: 'Basketball',
        quantity: 2,
        unit: 'courts',
        description: 'Full court · Indoor · Scoreboard',
        rate: '—',
        rateUnit: '/hr',
        status: 'Available',
        image: '../assets/courts/basketball.jpg'
    },
    {
        id: 'badminton',
        name: 'Badminton',
        quantity: 9,
        unit: 'courts',
        description: 'Indoor · Rackets for rent',
        rate: '—',
        rateUnit: '/hr',
        status: 'Available',
        image: '../assets/courts/badminton.jpg'
    },
    {
        id: 'lawn-tennis',
        name: 'Lawn Tennis',
        quantity: 3,
        unit: 'courts',
        description: 'Outdoor · Professional grade',
        rate: '—',
        rateUnit: '/hr',
        status: 'Available',
        image: '../assets/courts/lawn-tennis.jpg'
    },
    {
        id: 'pickleball',
        name: 'Pickleball',
        quantity: 2,
        unit: 'courts',
        description: 'Indoor · Recently added',
        rate: '—',
        rateUnit: '/hr',
        status: 'Available',
        image: '../assets/courts/pickleball.jpg'
    },
    {
        id: 'bowling-duckpin',
        name: 'Bowling — Duckpin',
        quantity: 8,
        unit: 'lanes',
        description: 'Duckpin bowling · Shoes included',
        rate: '—',
        rateUnit: '/game',
        status: 'Available',
        image: '../assets/courts/bowling-duckpin.jpg',
        note: '// TODO: confirm if duckpin is billed per-game or per-hour; may need different booking flow'
    },
    {
        id: 'bowling-tenpin',
        name: 'Bowling — Ten-Pin',
        quantity: 12,
        unit: 'lanes',
        description: 'Ten-pin bowling · Shoes included',
        rate: '—',
        rateUnit: '/game',
        status: 'Available',
        image: '../assets/courts/bowling-tenpin.jpg',
        note: '// TODO: confirm if ten-pin is billed per-game or per-hour; may need different booking flow'
    },
    {
        id: 'billiards',
        name: 'Billiards',
        quantity: 2,
        unit: 'tables',
        description: 'Professional pool tables · Cue service available',
        rate: '—',
        rateUnit: '/hr',
        status: 'Available',
        image: '../assets/courts/billiards.jpg'
    },
    {
        id: 'table-tennis',
        name: 'Table Tennis',
        quantity: 2,
        unit: 'tables',
        description: 'Tournament-grade tables · Paddles for rent',
        rate: '—',
        rateUnit: '/hr',
        status: 'Available',
        image: '../assets/courts/table-tennis.jpg'
    },
    {
        id: 'volleyball',
        name: 'Volleyball',
        quantity: 1,
        unit: 'court',
        description: 'Full court · Indoor · Net included',
        rate: '—',
        rateUnit: '/hr',
        status: 'Available',
        image: '../assets/courts/volleyball.jpg'
    }
];

// TODO: confirm with Ms. Driz: hourly rates for each sport (Basketball, Badminton, Lawn Tennis, Pickleball, Billiards, Table Tennis, Volleyball).
// TODO: confirm if Bowling (duckpin & ten-pin) is billed per-game or per-hour, and rates for each lane type.

console.log('[IñigoSync] courts inventory loaded from static array (demo mode). TODO: wire to GET /api/courts.php');
