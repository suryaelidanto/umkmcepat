# Unique Phone + Drop Waitlist WhatsApp Design

## Goal

One verified phone number per account. Stop collecting WhatsApp on `/waitlist` — OTP on `/verify` is the source of truth.

## Problem

- `/waitlist` still has an optional WhatsApp field that writes `WaitlistEntry.phone`, even though `/verify` already binds a number to `User.phone` via OTP.
- `User.phone` is not unique, so the same number can be claimed by multiple accounts.

## Decisions

1. **Remove** the WhatsApp field from the waitlist form and stop writing phone on waitlist submit.
2. **Keep** `WaitlistEntry.phone` column for legacy rows; admin still shows it when present. New submits leave it null / do not overwrite on update.
3. **`User.phone` is unique** (Postgres allows many NULLs).
4. **Reject on OTP send and verify** if the number is owned by another user (HTTP 409). Same user re-using their own number is OK.
5. **Normalize** to `+62…` before store/compare so uniqueness is not bypassed by format variants.

## User-facing copy

- Taken number: `Nomor ini sudah terpakai di akun lain.`

## Out of scope

- Dropping the `WaitlistEntry.phone` column
- Admin join to live `User.phone`
- Phone change / reclaim after verify
