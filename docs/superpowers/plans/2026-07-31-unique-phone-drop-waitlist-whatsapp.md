# Unique Phone + Drop Waitlist WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One verified phone per account; remove WhatsApp collection from `/waitlist`.

**Architecture:** Shared phone normalize + availability check; OTP send/verify gates; Prisma unique on `User.phone`; strip waitlist form/API write path.

**Tech Stack:** Prisma/Postgres, existing OTP (`src/lib/otp.ts`), waitlist form/API.

## Global Constraints

- User-facing copy: Indonesian
- Phone format: `+62` + digits (same as `/verify`)
- Error on taken number: `Nomor ini sudah terpakai di akun lain.`
- HTTP: **409** when phone owned by another user
- Do **not** drop `WaitlistEntry.phone` column
- Do **not** build phone-change / reclaim flow

---

### Task 1: Phone normalize + uniqueness helpers + OTP gates

**Files:**
- Create: `src/lib/phone.ts`
- Create: `src/lib/phone.test.ts`
- Modify: `src/lib/otp.ts`
- Modify: `src/routes/api.auth.otp.send.ts`
- Modify: `src/lib/otp.test.ts`

- [ ] Add `normalizePhone` + `assertPhoneAvailable`
- [ ] Wire send + verify; reject taken with 409 / error string
- [ ] Tests for normalize + taken/available + verify rejection

### Task 2: `User.phone` unique migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/..._user_phone_unique/migration.sql`

- [ ] Dedupe then unique index
- [ ] `bun run db:migrate`

### Task 3: Remove WhatsApp from waitlist

**Files:**
- Modify: `src/routes/_main.waitlist.tsx`
- Modify: `src/routes/api.waitlist.ts`
- Modify: `src/lib/waitlist.ts`
- Modify: `src/lib/waitlist-own-entry.ts` (+ test) — drop phone from own entry if unused

- [ ] Remove form field, FormData, draft, schema
- [ ] Stop writing phone on submit; update does not touch phone
- [ ] Admin legacy display unchanged

### Task 4: Verify

- [ ] `bun test src/lib/phone.test.ts src/lib/otp.test.ts src/lib/waitlist*.test.ts`
- [ ] Focused typecheck/lint as needed
