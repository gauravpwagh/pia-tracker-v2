-- V082__users_add_is_demo.sql
-- Adds is_demo flag to distinguish seeded demo/test users from actual users.
-- Existing rows default to false; the update below marks all known demo users.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users SET is_demo = TRUE WHERE email IN (
    'rajesh.kumar@nr.railnet.gov.in',
    'priya.sharma@nr.railnet.gov.in',
    'amit.verma@nr.railnet.gov.in',
    'sunita.patel@nr.railnet.gov.in',
    'mohammed.asif@nr.railnet.gov.in',
    'kavitha.subramanian@scr.railnet.gov.in',
    'venkatesh.rao@scr.railnet.gov.in',
    'lakshmi.narasimhan@sr.railnet.gov.in',
    'vikram.nair@nr.railnet.gov.in',
    'arjun.mehta@nr.railnet.gov.in',
    'deepa.krishnamurthy@nr.railnet.gov.in',
    'admin@pia.railnet.gov.in',
    'superadmin@pia.railnet.gov.in'
);
