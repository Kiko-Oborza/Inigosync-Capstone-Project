-- IñigoSync database schema
-- MySQL 8.0+
-- Import with: mysql -u root -p < database/inigos_sync.sql

CREATE DATABASE IF NOT EXISTS inigos_sync
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inigos_sync;

CREATE TABLE users (
    user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NULL,
    role ENUM('customer', 'staff', 'admin') NOT NULL DEFAULT 'customer',
    email_verified_at DATETIME NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB;

CREATE TABLE email_verifications (
    verification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    verified_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_verifications_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    KEY idx_email_verifications_user_expiry (user_id, expires_at)
) ENGINE=InnoDB;

CREATE TABLE password_reset_tokens (
    reset_token_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_password_reset_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    KEY idx_password_reset_tokens_user_expiry (user_id, expires_at)
) ENGINE=InnoDB;

CREATE TABLE courts (
    court_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sport ENUM('basketball', 'volleyball', 'badminton', 'bowling', 'pickleball') NOT NULL,
    description VARCHAR(500) NULL,
    rate DECIMAL(10,2) NOT NULL,
    billing_unit ENUM('hour', 'game') NOT NULL DEFAULT 'hour',
    capacity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    is_indoor BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_courts_name (name),
    CONSTRAINT chk_courts_rate CHECK (rate >= 0),
    CONSTRAINT chk_courts_capacity CHECK (capacity > 0)
) ENGINE=InnoDB;

CREATE TABLE court_features (
    court_feature_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    court_id BIGINT UNSIGNED NOT NULL,
    feature_name VARCHAR(100) NOT NULL,
    CONSTRAINT fk_court_features_court
        FOREIGN KEY (court_id) REFERENCES courts(court_id) ON DELETE CASCADE,
    UNIQUE KEY uq_court_feature (court_id, feature_name)
) ENGINE=InnoDB;

CREATE TABLE bookings (
    booking_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_code CHAR(12) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    court_id BIGINT UNSIGNED NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    rate_at_booking DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_option ENUM('downpayment', 'full') NOT NULL,
    status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'pending',
    grace_expires_at DATETIME NOT NULL,
    checked_in_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    cancellation_reason VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bookings_code (booking_code),
    KEY idx_bookings_court_schedule (court_id, booking_date, start_time, end_time),
    KEY idx_bookings_user_date (user_id, booking_date),
    KEY idx_bookings_status_grace (status, grace_expires_at),
    CONSTRAINT fk_bookings_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_court
        FOREIGN KEY (court_id) REFERENCES courts(court_id) ON DELETE RESTRICT,
    CONSTRAINT chk_bookings_time CHECK (end_time > start_time),
    CONSTRAINT chk_bookings_amounts CHECK (rate_at_booking >= 0 AND total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE payments (
    payment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_type ENUM('downpayment', 'balance', 'full') NOT NULL,
    method ENUM('gcash', 'cash', 'other') NOT NULL,
    status ENUM('pending', 'paid', 'failed', 'refunded', 'non_refundable') NOT NULL DEFAULT 'pending',
    reference_number VARCHAR(100) NULL,
    paid_at DATETIME NULL,
    recorded_by BIGINT UNSIGNED NULL,
    notes VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE RESTRICT,
    CONSTRAINT fk_payments_recorded_by
        FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL,
    KEY idx_payments_booking (booking_id),
    KEY idx_payments_status (status),
    UNIQUE KEY uq_payments_reference (reference_number),
    CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE booking_status_history (
    booking_status_history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT UNSIGNED NOT NULL,
    previous_status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no_show') NULL,
    new_status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no_show') NOT NULL,
    changed_by BIGINT UNSIGNED NULL,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_status_history_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_status_history_user
        FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE SET NULL,
    KEY idx_booking_status_history_booking (booking_id, created_at)
) ENGINE=InnoDB;

-- Starting court records shown in the current dashboard.
INSERT INTO courts (name, sport, description, rate, billing_unit, capacity, is_indoor) VALUES
    ('Basketball - Full Court', 'basketball', 'Full court with scoreboard.', 300.00, 'hour', 1, TRUE),
    ('Volleyball Court', 'volleyball', 'Net and markers included.', 250.00, 'hour', 1, TRUE),
    ('Badminton - Court 1', 'badminton', 'Indoor badminton court; rackets available for rent.', 200.00, 'hour', 1, TRUE),
    ('Bowling - Lane 1', 'bowling', 'Bowling lane; shoes included.', 150.00, 'game', 1, TRUE),
    ('Pickleball - Court 1', 'pickleball', 'Indoor pickleball court.', 220.00, 'hour', 1, TRUE);

-- Before creating a booking, run this in a transaction to avoid double bookings:
-- SELECT booking_id FROM bookings
-- WHERE court_id = ? AND booking_date = ?
--   AND status IN ('pending', 'confirmed')
--   AND start_time < ? AND end_time > ?
-- FOR UPDATE;
-- Insert only if this returns no rows.
