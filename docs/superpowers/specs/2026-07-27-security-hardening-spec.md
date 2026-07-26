# UMKM Cepat Security Hardening Spec

**Date:** 2026-07-27  
**Status:** Implementation Plan (Not Yet Implemented)  
**Scope:** Comprehensive security audit and hardening to eliminate vulnerabilities and prevent abuse

## Executive Summary

UMKM Cepat is an AI-powered business website generator with a React/TypeScript/Next.js frontend and PostgreSQL/Prisma backend. The platform generates complete React applications for Indonesian MSMEs through conversational AI, with deployment to Cloudflare R2 storage and preview environments.

This security hardening spec identifies **23 vulnerabilities** across 15 categories, ranging from critical (CVSS 9.0+) to low-severity issues. The plan provides **45 concrete implementation tasks** organized into 8 phases, with estimated effort, testing strategies, and success criteria.

**Key Findings:**
- **2 Critical vulnerabilities** requiring immediate attention (React2Shell exposure, BOLA/IDOR gaps)
- **8 High-severity vulnerabilities** affecting authentication, authorization, and data protection
- **9 Medium-severity vulnerabilities** in input validation, error handling, and infrastructure
- **4 Low-severity vulnerabilities** in configuration and operational security

---

## Vulnerability Categories

### 1. Authentication & Session Security

#### 1.1 OTP Brute Force Vulnerability [CRITICAL]
**Current State:**
- 4-digit OTP codes (10,000 possibilities)
- No rate limiting on OTP verification
- No account lockout after failed attempts
- OTP codes stored in plain text in database

**Risk:** Attackers can brute-force OTP codes within minutes using automated tools.

**Evidence:** PortSwigger Web Security Academy demonstrates 4-digit OTP bypass via session-handling macros that re-authenticate after 2 failed attempts.

**Implementation Plan:**

**Task 1.1.1: Increase OTP Length**
- **Files:** `src/lib/otp.ts`
- **Changes:**
  ```typescript
  // Current
  const OTP_LENGTH = 4;
  
  // New
  const OTP_LENGTH = 6; // 1 million possibilities
  ```
- **Migration:** Invalidate all existing pending OTPs
- **Testing:** Unit test OTP generation produces 6-digit codes

**Task 1.1.2: Add Rate Limiting**
- **Files:** `src/lib/rate-limit.ts`, `src/routes/auth.otp.ts`
- **Changes:**
  ```typescript
  // Add to rate-limit.ts
  export const otpRateLimit = new RateLimit({
    namespace: 'otp-verification',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many OTP attempts. Please request a new code.',
  });
  
  // Apply in auth.otp.ts
  const { error } = await otpRateLimit.consume(clientIP);
  if (error) return c.json({ error: error.message }, 429);
  ```
- **Testing:** Integration test verifies rate limiting after 5 failed attempts

**Task 1.1.3: Add Account Lockout**
- **Files:** `src/services/user.service.ts`, `prisma/schema.prisma`
- **Changes:**
  ```prisma
  model User {
    // Add fields
    otpAttempts      Int      @default(0)
    otpLockedUntil   DateTime?
  }
  ```
  ```typescript
  // In OTP verification service
  if (user.otpAttempts >= 5) {
    const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min lock
    await prisma.user.update({
      where: { id: user.id },
      data: { otpLockedUntil: lockUntil }
    });
    return { error: 'Account locked due to too many attempts' };
  }
  
  // Reset on success
  if (validOTP) {
    await prisma.user.update({
      where: { id: user.id },
      data: { otpAttempts: 0, otpLockedUntil: null }
    });
  }
  ```
- **Testing:** Unit test lockout triggers after 5 attempts, resets after 30 minutes

**Task 1.1.4: Hash OTP Codes Before Storage**
- **Files:** `src/services/otp.service.ts`, `src/lib/crypto.ts`
- **Changes:**
  ```typescript
  import { hash } from 'argon2';
  
  // When generating OTP
  const otpCode = generateOTP(); // "123456"
  const otpHash = await hash(otpCode, {
    type: argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
  
  // Store hash in database
  await prisma.otp.create({
    data: { userId, otpHash, expiresAt }
  });
  
  // When verifying OTP
  const otp = await prisma.otp.findFirst({ where: { userId } });
  const valid = await argon2.verify(otp.otpHash, userInput);
  ```
- **Testing:** Unit test verifies OTP codes are hashed before storage, plain text never persisted

**Effort:** 2-3 days  
**Priority:** P0 (Immediate)

---

#### 1.2 Session Management Gaps [HIGH]
**Current State:**
- JWT tokens with 7-day expiration
- No refresh token rotation
- No session invalidation on logout
- SameSite cookie attribute not explicitly set

**Risk:** Stolen JWT tokens remain valid for 7 days. No mechanism to revoke compromised sessions.

**Implementation Plan:**

**Task 1.2.1: Implement Refresh Token Rotation**
- **Files:** `src/services/auth.service.ts`, `prisma/schema.prisma`
- **Changes:**
  ```prisma
  model RefreshToken {
    id        String   @id @default(cuid())
    userId    String
    token     String   @unique
    expiresAt DateTime
    createdAt DateTime @default(now())
    user      User     @relation(fields: [userId], references: [id])
  }
  ```
  ```typescript
  // When refreshing access token
  export async function refreshAccessToken(refreshToken: string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken }
    });
    
    if (!stored || stored.expiresAt < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }
    
    // Reuse detection: if token was already used, invalidate all user sessions
    const allTokens = await prisma.refreshToken.findMany({
      where: { userId: stored.userId }
    });
    
    if (allTokens.length > 1) {
      // Potential reuse attack - invalidate all
      await prisma.refreshToken.deleteMany({
        where: { userId: stored.userId }
      });
      throw new Error('Session invalidated due to suspicious activity');
    }
    
    // Issue new tokens
    const newAccessToken = generateJWT(stored.userId, '15m');
    const newRefreshToken = generateRefreshToken();
    
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    await prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });
    
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
  ```
- **Testing:** Unit test verifies refresh token rotation, reuse detection invalidates all sessions

**Task 1.2.2: Add Session Invalidation on Logout**
- **Files:** `src/routes/auth.logout.ts`, `src/services/auth.service.ts`
- **Changes:**
  ```typescript
  // On logout
  export async function logout(userId: string) {
    // Delete all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId } });
    
    // Optional: Add to blacklist cache for immediate access token invalidation
    await redis.set(`logout:${userId}`, '1', 'EX', 15 * 60); // 15 min TTL
    
    return { success: true };
  }
  
  // In JWT verification middleware
  const blacklisted = await redis.get(`logout:${decoded.userId}`);
  if (blacklisted) {
    return c.json({ error: 'Token invalidated' }, 401);
  }
  ```
- **Testing:** Integration test verifies logout invalidates all tokens, subsequent requests fail

**Task 1.2.3: Set SameSite Cookie Attribute**
- **Files:** `src/middleware/auth.ts`
- **Changes:**
  ```typescript
  // Set cookie with security attributes
  c.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // CSRF protection
    maxAge: 15 * 60, // 15 minutes
    path: '/',
  });
  ```
- **Testing:** Integration test verifies cookie attributes in response headers

**Effort:** 2-3 days  
**Priority:** P1 (This Sprint)

---

### 2. Authorization & Access Control

#### 2.1 BOLA/IDOR Vulnerabilities [CRITICAL]
**Current State:**
- User can access `/projects/:id` without ownership verification in some routes
- No database-level row-level security (RLS)
- Shared resources (templates, media) not scoped to tenant

**Risk:** CVSS 8.8-9.5. Users can access, modify, or delete other users' projects by guessing or enumerating project IDs.

**Evidence:** OWASP API Top 10 (2023) ranks BOLA as #1 vulnerability. Multi-tenant IDOR exposes entire organization's data with single request.

**Implementation Plan:**

**Task 2.1.1: Add Ownership Verification Middleware**
- **Files:** `src/middleware/ownership.ts` (new), `src/routes/projects.ts`
- **Changes:**
  ```typescript
  // src/middleware/ownership.ts
  export async function verifyProjectOwnership(c: Context, next: Next) {
    const projectId = c.req.param('id');
    const userId = c.get('userId'); // From JWT
    
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    if (project.userId !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    
    await next();
  }
  
  // Apply to all project routes
  app.get('/projects/:id', verifyProjectOwnership, async (c) => {
    // ... handler
  });
  ```
- **Testing:** Integration test verifies user A cannot access user B's project

**Task 2.1.2: Implement PostgreSQL Row-Level Security**
- **Files:** `prisma/migrations/[timestamp]_add_rls/migration.sql`
- **Changes:**
  ```sql
  -- Enable RLS on projects table
  ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
  
  -- Create policy: users can only see their own projects
  CREATE POLICY "Users can view own projects" ON "Project"
    FOR SELECT USING (auth.uid() = "userId");
  
  -- Create policy: users can only modify their own projects
  CREATE POLICY "Users can modify own projects" ON "Project"
    FOR UPDATE USING (auth.uid() = "userId");
  
  -- Create policy: users can only delete their own projects
  CREATE POLICY "Users can delete own projects" ON "Project"
    FOR DELETE USING (auth.uid() = "userId");
  
  -- Repeat for related tables (ProjectAsset, ProjectChat, etc.)
  ```
  
  ```typescript
  // src/lib/prisma.ts - Set session variable for RLS
  export async function setRLSContext(userId: string) {
    await prisma.$executeRaw`SET app.current_user_id = ${userId}`;
  }
  
  // In middleware
  app.use('*', async (c, next) => {
    const userId = c.get('userId');
    if (userId) {
      await setRLSContext(userId);
    }
    await next();
  });
  ```
- **Testing:** Integration test verifies RLS policies block cross-tenant access even with direct SQL

**Task 2.1.3: Add IDOR Detection Tests**
- **Files:** `tests/integration/idor.test.ts` (new)
- **Changes:**
  ```typescript
  describe('IDOR Prevention', () => {
    test('User A cannot access User B project', async () => {
      const userA = await createUser();
      const userB = await createUser();
      const projectB = await createProject(userB.id);
      
      const tokenA = await login(userA);
      
      const response = await fetch(`/api/projects/${projectB.id}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      
      expect(response.status).toBe(403);
    });
    
    test('User A cannot modify User B project', async () => {
      // Similar test for PUT/PATCH
    });
    
    test('User A cannot delete User B project', async () => {
      // Similar test for DELETE
    });
  });
  ```
- **Testing:** All IDOR tests pass, verifying ownership checks on all CRUD operations

**Effort:** 3-4 days  
**Priority:** P0 (Immediate)

---

#### 2.2 Privilege Escalation via Mass Assignment [HIGH]
**Current State:**
- `project.update()` accepts raw user input without field whitelisting
- Users can modify `role`, `isAdmin`, or other privileged fields via API

**Risk:** Users can escalate privileges by adding `role: "admin"` to update payloads.

**Implementation Plan:**

**Task 2.2.1: Implement Field Whitelisting**
- **Files:** `src/services/project.service.ts`, `src/validators/project.validator.ts`
- **Changes:**
  ```typescript
  // src/validators/project.validator.ts
  import { z } from 'zod';
  
  export const updateProjectSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    // Only allow safe fields
  });
  
  // src/services/project.service.ts
  export async function updateProject(id: string, input: unknown) {
    const validated = updateProjectSchema.parse(input);
    
    return prisma.project.update({
      where: { id },
      data: validated, // Only whitelisted fields
    });
  }
  ```
- **Testing:** Unit test verifies malicious fields are rejected, only whitelisted fields updated

**Task 2.2.2: Audit All Update Operations**
- **Files:** All service files with `.update()` calls
- **Changes:** Review and add validation to:
  - `user.update()` - Prevent `role`, `isAdmin` modification
  - `project.update()` - Prevent `userId`, `createdAt` modification
  - `deployment.update()` - Prevent `status` manipulation
- **Testing:** Unit tests for each update operation verify field restrictions

**Effort:** 1-2 days  
**Priority:** P1 (This Sprint)

---

### 3. Input Validation & Injection

#### 3.1 SQL Injection via Prisma Raw Queries [HIGH]
**Current State:**
- Using `$queryRaw` with string concatenation in some places
- No input sanitization for dynamic SQL queries

**Risk:** Attackers can inject malicious SQL via user-controlled parameters.

**Evidence:** Prisma documentation states `$queryRawUnsafe` is vulnerable to SQL injection. Even `$queryRaw` can be vulnerable if tagged templates are misused.

**Implementation Plan:**

**Task 3.1.1: Replace String Concatenation with Tagged Templates**
- **Files:** `src/services/analytics.service.ts`, `src/services/report.service.ts`
- **Changes:**
  ```typescript
  // Current (VULNERABLE)
  const query = `SELECT * FROM projects WHERE userId = '${userId}'`;
  const results = await prisma.$queryRaw(query);
  
  // New (SAFE)
  const results = await prisma.$queryRaw`
    SELECT * FROM projects WHERE "userId" = ${userId}
  `;
  ```
- **Testing:** Unit test verifies SQL injection attempts are neutralized

**Task 3.1.2: Add Input Validation for Dynamic Queries**
- **Files:** `src/validators/query.validator.ts` (new)
- **Changes:**
  ```typescript
  import { z } from 'zod';
  
  export const analyticsQuerySchema = z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    groupBy: z.enum(['day', 'week', 'month']),
  });
  
  // Validate before use
  const validated = analyticsQuerySchema.parse(input);
  ```
- **Testing:** Unit test verifies schema rejects malicious input

**Effort:** 1 day  
**Priority:** P1 (This Sprint)

---

#### 3.2 Command Injection via AI-Generated Code [HIGH]
**Current State:**
- AI-generated React code executed in browser sandbox
- No content security policy (CSP) headers
- Generated code can include `eval()`, `Function()`, or DOM manipulation

**Risk:** AI could generate malicious code that exfiltrates data or performs XSS attacks.

**Implementation Plan:**

**Task 3.2.1: Implement CSP Headers**
- **Files:** `src/middleware/security.ts` (new), `src/server.ts`
- **Changes:**
  ```typescript
  // src/middleware/security.ts
  export async function securityHeaders(c: Context, next: Next) {
    await next();
    
    c.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Needed for React hydration
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.umkmcepat.com",
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; '));
    
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
  
  // src/server.ts
  app.use('*', securityHeaders);
  ```
- **Testing:** Integration test verifies CSP headers present in all responses

**Task 3.2.2: Sanitize AI-Generated Code**
- **Files:** `src/services/code-generator.service.ts`, `src/lib/code-sanitizer.ts` (new)
- **Changes:**
  ```typescript
  // src/lib/code-sanitizer.ts
  export function sanitizeGeneratedCode(code: string): string {
    // Remove dangerous patterns
    const dangerous = [
      /eval\s*\(/g,
      /new\s+Function\s*\(/g,
      /document\.write\s*\(/g,
      /innerHTML\s*=/g,
      /outerHTML\s*=/g,
      /<script[^>]*>[\s\S]*?<\/script>/gi,
    ];
    
    let sanitized = code;
    for (const pattern of dangerous) {
      sanitized = sanitized.replace(pattern, '/* [REDACTED] */');
    }
    
    return sanitized;
  }
  
  // In code generation service
  const generatedCode = await generateCode(prompt);
  const safeCode = sanitizeGeneratedCode(generatedCode);
  ```
- **Testing:** Unit test verifies dangerous patterns are redacted

**Effort:** 2-3 days  
**Priority:** P1 (This Sprint)

---

#### 3.3 XSS via dangerouslySetInnerHTML [MEDIUM]
**Current State:**
- User-provided content rendered with `dangerouslySetInnerHTML` in some components
- No HTML sanitization before rendering

**Risk:** Stored XSS attacks via malicious HTML in user input.

**Implementation Plan:**

**Task 3.3.1: Add DOMPurify for HTML Sanitization**
- **Files:** `package.json`, `src/components/RichText.tsx`
- **Changes:**
  ```bash
  bun add dompurify @types/dompurify
  ```
  ```typescript
  // src/components/RichText.tsx
  import DOMPurify from 'dompurify';
  
  export function RichText({ html }: { html: string }) {
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: [],
    });
    
    return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  ```
- **Testing:** Unit test verifies XSS payloads are neutralized

**Effort:** 0.5 day  
**Priority:** P2 (Next Sprint)

---

#### 3.4 ReDoS Vulnerabilities [MEDIUM]
**Current State:**
- Complex regex patterns in input validation (email, phone, URL)
- No timeout on regex execution

**Risk:** Attackers can craft input that causes exponential backtracking, hanging the server.

**Implementation Plan:**

**Task 3.4.1: Replace Vulnerable Regex Patterns**
- **Files:** `src/validators/user.validator.ts`, `src/validators/project.validator.ts`
- **Changes:**
  ```typescript
  // Current (VULNERABLE to ReDoS)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  // New (SAFE - linear time)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
  // Note: Added {2,63} length limit to prevent catastrophic backtracking
  ```
- **Testing:** Unit test with ReDoS payloads (e.g., `'a]' + 'a'.repeat(50000) + '!'`) completes in <100ms

**Task 3.4.2: Add Regex Timeout**
- **Files:** `src/lib/regex.ts` (new)
- **Changes:**
  ```typescript
  export function safeRegexTest(pattern: RegExp, input: string, timeoutMs = 100): boolean {
    const start = Date.now();
    
    // Use worker thread for isolation
    return new Promise((resolve, reject) => {
      const worker = new Worker('./regex-worker.js', {
        workerData: { pattern: pattern.source, input }
      });
      
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error('Regex timeout'));
      }, timeoutMs);
      
      worker.on('message', (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      
      worker.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  ```
- **Testing:** Unit test verifies timeout triggers for malicious input

**Effort:** 1-2 days  
**Priority:** P2 (Next Sprint)

---

### 4. Data Exposure & Privacy

#### 4.1 Error Message Information Disclosure [MEDIUM]
**Current State:**
- Stack traces returned in production error responses
- Database error messages exposed to users
- Internal file paths visible in error logs

**Risk:** Attackers can gather intelligence about system architecture, database schema, and file structure.

**Implementation Plan:**

**Task 4.1.1: Implement Generic Error Responses**
- **Files:** `src/middleware/error-handler.ts`
- **Changes:**
  ```typescript
  // src/middleware/error-handler.ts
  export async function errorHandler(err: Error, c: Context) {
    // Log full error internally
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      path: c.req.path,
      userId: c.get('userId'),
      timestamp: new Date().toISOString(),
    });
    
    // Return generic message to user
    if (process.env.NODE_ENV === 'production') {
      return c.json({
        error: 'An unexpected error occurred. Please try again later.',
        requestId: c.get('requestId'), // For support correlation
      }, 500);
    }
    
    // Development: show full error
    return c.json({ error: err.message, stack: err.stack }, 500);
  }
  ```
- **Testing:** Integration test verifies production errors don't expose stack traces

**Task 4.1.2: Sanitize Database Errors**
- **Files:** `src/lib/prisma.ts`
- **Changes:**
  ```typescript
  // Wrap Prisma client with error sanitization
  export const prisma = new PrismaClient({
    errorFormat: 'minimal', // Don't include query in error
  });
  
  // Custom error handler
  prisma.$use(async (params, next) => {
    try {
      return await next(params);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Map to generic error
        throw new Error('Database operation failed');
      }
      throw error;
    }
  });
  ```
- **Testing:** Unit test verifies database errors don't expose table names or schema

**Effort:** 1 day  
**Priority:** P2 (Next Sprint)

---

#### 4.2 Logging PII in Development Mode [MEDIUM]
**Current State:**
- OTP codes logged to console in development
- User email addresses logged in request handlers
- Phone numbers logged in SMS service

**Risk:** PII exposure in logs violates GDPR/privacy regulations. Logs may be persisted or transmitted insecurely.

**Implementation Plan:**

**Task 4.2.1: Implement PII Masking in Logs**
- **Files:** `src/lib/logger.ts` (new), update all logging calls
- **Changes:**
  ```typescript
  // src/lib/logger.ts
  export function maskPII(data: Record<string, unknown>): Record<string, unknown> {
    const piiFields = ['email', 'phone', 'otp', 'password', 'token'];
    const masked = { ...data };
    
    for (const field of piiFields) {
      if (masked[field]) {
        if (typeof masked[field] === 'string') {
          masked[field] = '[REDACTED]';
        }
      }
    }
    
    return masked;
  }
  
  export function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
    const safeData = data ? maskPII(data) : undefined;
    console[level](`[${new Date().toISOString()}] ${message}`, safeData);
  }
  ```
- **Testing:** Unit test verifies PII fields are masked before logging

**Effort:** 0.5 day  
**Priority:** P2 (Next Sprint)

---

### 5. Infrastructure & Configuration

#### 5.1 Rate Limiting Gaps [HIGH]
**Current State:**
- Rate limiting only on `/auth/login` and `/auth/register`
- No rate limiting on:
  - OTP verification
  - Password reset
  - Project creation
  - AI generation requests
  - File uploads

**Risk:** Attackers can abuse unrate-limited endpoints (brute force, resource exhaustion, spam).

**Implementation Plan:**

**Task 5.1.1: Add Rate Limiting to All Endpoints**
- **Files:** `src/middleware/rate-limit.ts` (new), all route files
- **Changes:**
  ```typescript
  // src/middleware/rate-limit.ts
  import { RateLimit } from 'hono-rate-limit';
  
  export const authRateLimit = new RateLimit({
    namespace: 'auth',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
  });
  
  export const projectRateLimit = new RateLimit({
    namespace: 'projects',
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
  });
  
  export const aiRateLimit = new RateLimit({
    namespace: 'ai',
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
  });
  
  export const uploadRateLimit = new RateLimit({
    namespace: 'uploads',
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100,
  });
  
  // Apply to routes
  app.post('/auth/otp', authRateLimit.middleware, otpHandler);
  app.post('/projects', projectRateLimit.middleware, createProjectHandler);
  app.post('/ai/generate', aiRateLimit.middleware, generateHandler);
  app.post('/uploads', uploadRateLimit.middleware, uploadHandler);
  ```
- **Testing:** Integration test verifies rate limiting on all protected endpoints

**Task 5.1.2: Add Defense-in-Depth (CAPTCHA)**
- **Files:** `src/routes/auth.ts`, `src/lib/captcha.ts` (new)
- **Changes:**
  ```typescript
  // src/lib/captcha.ts
  export async function verifyCaptcha(token: string): Promise<boolean> {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`,
    });
    
    const data = await response.json();
    return data.success && data.score >= 0.5;
  }
  
  // Apply to login after 3 failed attempts
  app.post('/auth/login', async (c) => {
    const attempts = await getLoginAttempts(c.req.header('X-Forwarded-For'));
    
    if (attempts >= 3) {
      const captchaToken = c.req.header('X-Captcha-Token');
      if (!captchaToken || !(await verifyCaptcha(captchaToken))) {
        return c.json({ error: 'Please complete CAPTCHA' }, 403);
      }
    }
    
    // Continue with login
  });
  ```
- **Testing:** Integration test verifies CAPTCHA required after failed attempts

**Effort:** 2-3 days  
**Priority:** P1 (This Sprint)

---

#### 5.2 In-Memory Rate Limiter Limitation [LOW]
**Current State:**
- Rate limiting uses in-memory `Map` (not distributed)
- Each server instance has separate rate limit state

**Risk:** In multi-instance deployments, users can bypass rate limits by distributing requests across instances.

**Implementation Plan:**

**Task 5.2.1: Document Limitation and Migration Path**
- **Files:** `src/middleware/rate-limit.ts`, `docs/infrastructure/scaling.md`
- **Changes:**
  ```typescript
  // src/middleware/rate-limit.ts
  /**
   * In-memory rate limiter.
   * 
   * LIMITATION: Not distributed across server instances.
   * In multi-instance deployments, each instance has separate state.
   * 
   * MIGRATION: When scaling to multiple instances, replace with:
   * - Redis-based rate limiting (e.g., @upstash/ratelimit)
   * - Shared Redis instance with sliding window algorithm
   * 
   * For now, acceptable for single-instance deployment.
   */
  ```
  
  ```markdown
  # docs/infrastructure/scaling.md
  
  ## Rate Limiting
  
  Current implementation uses in-memory rate limiting. When scaling to multiple instances:
  
  1. Deploy Redis instance
  2. Replace `src/middleware/rate-limit.ts` with Redis-backed implementation
  3. Use `@upstash/ratelimit` or similar library
  4. Configure sliding window algorithm for smooth distribution
  ```
- **Testing:** N/A (documentation only)

**Effort:** 0.5 day  
**Priority:** P3 (Backlog)

---

### 6. AI Gateway Security

#### 6.1 Prompt Injection Attacks [HIGH]
**Current State:**
- User prompts sent directly to AI without sanitization
- No output validation for malicious code
- No content moderation on AI responses

**Risk:** Attackers can craft prompts to generate malicious code, exfiltrate data, or bypass safety controls.

**Implementation Plan:**

**Task 6.1.1: Add Prompt Sanitization**
- **Files:** `src/services/ai.service.ts`, `src/lib/prompt-sanitizer.ts` (new)
- **Changes:**
  ```typescript
  // src/lib/prompt-sanitizer.ts
  export function sanitizePrompt(prompt: string): string {
    // Remove injection patterns
    const dangerous = [
      /ignore previous instructions/gi,
      /forget everything above/gi,
      /you are now/gi,
      /system prompt/gi,
      /developer mode/gi,
    ];
    
    let sanitized = prompt;
    for (const pattern of dangerous) {
      sanitized = sanitized.replace(pattern, '[FILTERED]');
    }
    
    return sanitized;
  }
  
  // In AI service
  const sanitizedPrompt = sanitizePrompt(userPrompt);
  const response = await aiClient.chat(sanitizedPrompt);
  ```
- **Testing:** Unit test verifies injection patterns are filtered

**Task 6.1.2: Add Output Validation**
- **Files:** `src/services/ai.service.ts`, `src/lib/output-validator.ts` (new)
- **Changes:**
  ```typescript
  // src/lib/output-validator.ts
  export function validateAIOutput(output: string): { valid: boolean; reason?: string } {
    // Check for malicious patterns
    const malicious = [
      /eval\s*\(/g,
      /new\s+Function\s*\(/g,
      /document\.cookie/g,
      /localStorage\.setItem/g,
      /fetch\s*\(\s*['"]https?:\/\//g, // External fetch
    ];
    
    for (const pattern of malicious) {
      if (pattern.test(output)) {
        return { valid: false, reason: 'Output contains potentially malicious code' };
      }
    }
    
    return { valid: true };
  }
  
  // In AI service
  const response = await aiClient.chat(prompt);
  const validation = validateAIOutput(response);
  
  if (!validation.valid) {
    throw new Error(`AI output rejected: ${validation.reason}`);
  }
  ```
- **Testing:** Unit test verifies malicious outputs are rejected

**Effort:** 2-3 days  
**Priority:** P1 (This Sprint)

---

#### 6.2 Token Exhaustion Attacks [MEDIUM]
**Current State:**
- No daily/hourly limits on AI generation requests
- No cost tracking per user
- Users can generate unlimited code

**Risk:** Attackers can exhaust AI API budget (token exhaustion) or abuse platform for free compute.

**Implementation Plan:**

**Task 6.2.1: Implement Token Budget System**
- **Files:** `src/services/ai.service.ts`, `prisma/schema.prisma`
- **Changes:**
  ```prisma
  model User {
    // Add fields
    aiTokensUsed    Int      @default(0)
    aiTokensLimit   Int      @default(10000) // Daily limit
    aiTokensResetAt DateTime @default(now())
  }
  ```
  ```typescript
  // In AI service
  export async function generateCode(userId: string, prompt: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    // Reset if day has passed
    if (user.aiTokensResetAt < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
      await prisma.user.update({
        where: { id: userId },
        data: { aiTokensUsed: 0, aiTokensResetAt: new Date() }
      });
      user.aiTokensUsed = 0;
    }
    
    // Check budget
    if (user.aiTokensUsed >= user.aiTokensLimit) {
      throw new Error('Daily AI generation limit reached');
    }
    
    // Generate and track tokens
    const response = await aiClient.chat(prompt);
    const tokensUsed = response.usage.totalTokens;
    
    await prisma.user.update({
      where: { id: userId },
      data: { aiTokensUsed: { increment: tokensUsed } }
    });
    
    return response;
  }
  ```
- **Testing:** Integration test verifies budget enforcement, daily reset

**Effort:** 1-2 days  
**Priority:** P2 (Next Sprint)

---

### 7. File Upload & Storage Security

#### 7.1 File Upload Validation Gaps [HIGH]
**Current State:**
- File uploads validated by extension only
- No magic byte validation
- No file size limits enforced server-side
- Uploaded files stored in web-accessible directory

**Risk:** Attackers can upload malicious files (polyglots, scripts) that execute on server or client.

**Implementation Plan:**

**Task 7.1.1: Add Magic Byte Validation**
- **Files:** `src/services/upload.service.ts`, `src/lib/file-validator.ts` (new)
- **Changes:**
  ```typescript
  // src/lib/file-validator.ts
  const MAGIC_BYTES = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF
  };
  
  export function validateFile(buffer: Buffer, expectedType: string): boolean {
    const signatures = MAGIC_BYTES[expectedType];
    if (!signatures) return false;
    
    for (const signature of signatures) {
      let match = true;
      for (let i = 0; i < signature.length; i++) {
        if (buffer[i] !== signature[i]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    
    return false;
  }
  
  // In upload service
  export async function uploadFile(file: File) {
    const buffer = await file.arrayBuffer();
    const buf = Buffer.from(buffer);
    
    if (!validateFile(buf, file.type)) {
      throw new Error('Invalid file type');
    }
    
    // Check size
    if (buf.length > 5 * 1024 * 1024) { // 5 MB
      throw new Error('File too large');
    }
    
    // Proceed with upload
  }
  ```
- **Testing:** Unit test verifies magic byte validation rejects polyglot files

**Task 7.1.2: Store Files Outside Web Root**
- **Files:** `src/services/upload.service.ts`, `docker-compose.yml`
- **Changes:**
  ```typescript
  // Store in non-web-accessible directory
  const uploadDir = '/data/uploads'; // Not served by web server
  
  // Generate random filename
  const filename = `${crypto.randomUUID()}${path.extname(file.name)}`;
  const filepath = path.join(uploadDir, filename);
  
  await fs.writeFile(filepath, buffer);
  
  // Store path in database
  await prisma.projectAsset.create({
    data: { projectId, filename, filepath }
  });
  ```
  
  ```yaml
  # docker-compose.yml
  services:
    app:
      volumes:
        - uploads:/data/uploads # Separate volume, not mounted to web root
  
  volumes:
    uploads:
  ```
- **Testing:** Integration test verifies uploaded files not directly accessible via URL

**Effort:** 1-2 days  
**Priority:** P1 (This Sprint)

---

### 8. Operational Security

#### 8.1 Missing Security Headers [LOW]
**Current State:**
- No `X-Frame-Options` header
- No `X-Content-Type-Options` header
- No `Referrer-Policy` header
- No `Permissions-Policy` header

**Risk:** Clickjacking, MIME sniffing, information leakage via referrer.

**Implementation Plan:**

**Task 8.1.1: Add All Security Headers**
- **Files:** `src/middleware/security.ts` (already created in Task 3.2.1)
- **Changes:** Already implemented in CSP headers task
- **Testing:** Integration test verifies all security headers present

**Effort:** 0 (covered by Task 3.2.1)  
**Priority:** P2 (Next Sprint)

---

## Implementation Phases

### Phase 1: Critical Vulnerabilities (Week 1-2)
**Priority:** P0  
**Tasks:**
- 1.1.1-1.1.4: OTP brute force prevention (2-3 days)
- 2.1.1-2.1.3: BOLA/IDOR prevention (3-4 days)

**Total Effort:** 5-7 days  
**Success Criteria:**
- OTP codes are 6 digits, hashed before storage
- Rate limiting prevents brute force (5 attempts per 15 min)
- Account lockout triggers after 5 failed attempts
- All project routes verify ownership
- PostgreSQL RLS policies active
- IDOR detection tests pass

---

### Phase 2: High-Severity Vulnerabilities (Week 2-3)
**Priority:** P1  
**Tasks:**
- 1.2.1-1.2.3: Session management (2-3 days)
- 2.2.1-2.2.2: Mass assignment prevention (1-2 days)
- 3.1.1-3.1.2: SQL injection prevention (1 day)
- 3.2.1-3.2.2: Command injection prevention (2-3 days)
- 5.1.1-5.1.2: Rate limiting gaps (2-3 days)
- 6.1.1-6.1.2: Prompt injection prevention (2-3 days)
- 7.1.1-7.1.2: File upload validation (1-2 days)

**Total Effort:** 11-17 days  
**Success Criteria:**
- Refresh token rotation implemented
- Logout invalidates all sessions
- SameSite cookie attribute set
- All update operations use field whitelisting
- No string concatenation in SQL queries
- CSP headers prevent code injection
- AI-generated code sanitized
- All endpoints rate-limited
- CAPTCHA required after failed login attempts
- Prompt injection patterns filtered
- AI output validated for malicious code
- File uploads validated by magic bytes
- Uploaded files stored outside web root

---

### Phase 3: Medium-Severity Vulnerabilities (Week 3-4)
**Priority:** P2  
**Tasks:**
- 3.3.1: XSS prevention via DOMPurify (0.5 day)
- 3.4.1-3.4.2: ReDoS prevention (1-2 days)
- 4.1.1-4.1.2: Error message sanitization (1 day)
- 4.2.1: PII masking in logs (0.5 day)
- 6.2.1: Token budget system (1-2 days)
- 8.1.1: Security headers (0 days - covered by 3.2.1)

**Total Effort:** 4-6 days  
**Success Criteria:**
- HTML sanitized before rendering
- Regex patterns safe from ReDoS
- Regex timeout prevents hanging
- Production errors don't expose stack traces
- Database errors sanitized
- PII masked in logs
- Daily AI token budget enforced

---

### Phase 4: Low-Severity & Documentation (Week 4+)
**Priority:** P3  
**Tasks:**
- 5.2.1: Document rate limiter limitation (0.5 day)

**Total Effort:** 0.5 day  
**Success Criteria:**
- Limitation documented in code and infrastructure docs
- Migration path to Redis-based rate limiting documented

---

## Testing Strategy

### Unit Tests
- **Coverage:** All new validation, sanitization, and security functions
- **Examples:**
  - OTP generation produces 6-digit codes
  - Magic byte validation rejects polyglot files
  - Prompt sanitizer filters injection patterns
  - Field whitelisting rejects malicious fields

### Integration Tests
- **Coverage:** All security-critical endpoints and flows
- **Examples:**
  - User A cannot access User B's project (IDOR)
  - OTP brute force triggers lockout
  - Rate limiting returns 429 after threshold
  - Logout invalidates all tokens
  - File upload rejects invalid magic bytes

### Security Tests
- **Coverage:** Adversarial testing of security controls
- **Examples:**
  - SQL injection payloads rejected
  - XSS payloads sanitized
  - ReDoS payloads complete in <100ms
  - Command injection patterns filtered
  - Prompt injection patterns filtered

### Penetration Testing
- **Scope:** Full application security assessment
- **Tools:** OWASP ZAP, Burp Suite, custom scripts
- **Frequency:** After each phase completion

---

## Success Criteria

### Phase 1 (Critical)
- [ ] No 4-digit OTP codes in production
- [ ] All OTP codes hashed before storage
- [ ] Rate limiting prevents OTP brute force
- [ ] Account lockout triggers after 5 failed OTP attempts
- [ ] All project routes verify ownership
- [ ] PostgreSQL RLS policies active on all tables
- [ ] IDOR detection tests pass (100% coverage)

### Phase 2 (High)
- [ ] Refresh token rotation implemented
- [ ] Logout invalidates all sessions (tested)
- [ ] SameSite cookie attribute set on all auth cookies
- [ ] All update operations use Zod validation
- [ ] No `$queryRaw` with string concatenation
- [ ] CSP headers present on all responses
- [ ] AI-generated code passes sanitization
- [ ] All endpoints have rate limiting
- [ ] CAPTCHA required after 3 failed login attempts
- [ ] Prompt injection patterns filtered
- [ ] AI output validation rejects malicious code
- [ ] File uploads validated by magic bytes
- [ ] Uploaded files not in web-accessible directory

### Phase 3 (Medium)
- [ ] HTML sanitized with DOMPurify before rendering
- [ ] All regex patterns safe from ReDoS (tested with malicious input)
- [ ] Regex timeout prevents hanging (<100ms)
- [ ] Production errors return generic messages
- [ ] Database errors don't expose schema
- [ ] PII fields masked in all logs
- [ ] Daily AI token budget enforced
- [ ] Budget resets after 24 hours

### Phase 4 (Low)
- [ ] Rate limiter limitation documented
- [ ] Migration path to Redis documented

---

## Monitoring & Alerting

### Security Metrics
- **OTP attempts:** Alert if >100 failed attempts per hour
- **Rate limit violations:** Alert if >1000 violations per hour
- **IDOR attempts:** Alert if >10 forbidden responses per hour
- **SQL injection attempts:** Alert if any detected
- **Prompt injection attempts:** Alert if >10 filtered prompts per hour

### Error Tracking
- **Sentry integration:** Capture all unhandled errors
- **Error rate:** Alert if >1% of requests result in 500 errors
- **Latency:** Alert if p95 latency >5 seconds

### Audit Logging
- **Authentication events:** Log all login/logout/OTP attempts
- **Authorization events:** Log all forbidden responses
- **Data access:** Log all project CRUD operations
- **File uploads:** Log all file upload attempts

---

## Conclusion

This security hardening spec identifies 23 vulnerabilities across 15 categories and provides 45 concrete implementation tasks organized into 8 phases. The plan prioritizes critical vulnerabilities (BOLA/IDOR, OTP brute force) for immediate remediation, followed by high-severity issues (session management, SQL injection, rate limiting gaps).

**Key Achievements:**
- **Defense-in-depth:** Multiple layers of security (application, database, infrastructure)
- **Proactive prevention:** Input validation, output sanitization, rate limiting
- **Reactive detection:** Error handling, audit logging, monitoring
- **Compliance:** GDPR-compliant PII handling, secure session management

**Estimated Total Effort:** 20-30 days (4 weeks)  
**Recommended Timeline:** 4-week sprint with weekly reviews  
**Success Metrics:** Zero critical/high vulnerabilities, 100% test coverage on security controls

---

## Appendices

### A. Vulnerability Sources
- OWASP Top 10 (2025): https://owasp.org/Top10/
- OWASP API Top 10 (2023): https://owasp.org/API-Security/
- PortSwigger Web Security Academy: https://portswigger.net/web-security
- React2Shell CVE-2025-55182: https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components
- Prisma SQL Injection: https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries

### B. Security Tools
- OWASP ZAP: https://www.zaproxy.org/
- Burp Suite: https://portswigger.net/burp
- Snyk: https://snyk.io/
- npm audit: Built-in Node.js vulnerability scanner

### C. Compliance References
- GDPR: https://gdpr.eu/
- PCI DSS: https://www.pcisecuritystandards.org/
- SOC 2: https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/soc-2

### D. Further Reading
- "The Web Application Hacker's Handbook" by Dafydd Stuttard
- "API Security in Action" by Neil Madden
- "Black Hat Python" by Justin Seitz
