# 04 — Resilience, Error Boundaries, and Security Contracts

How to build fault-tolerant, fail-closed, and secure applications.

---

## 1. Granular Error Containment (Localized Error Boundaries)

In amateur applications, a single runtime error in a minor widget crashes the entire React root, leaving the user with a blank white screen.

### The Granular Boundary Topology
Error boundaries must wrap autonomous, non-critical sub-regions of the interface:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Workspace Shell Container                       │
│                                                                        │
│  ┌──────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │   <ErrorBoundary            │  │  <ErrorBoundary                 │ │
│  │     fallback={<ChatFallback>}│  │    fallback={<PreviewFallback>} │ │
│  │   >                          │  │  >                               │ │
│  │     <WorkspaceChatPane />    │  │    <WorkspacePreviewPane />      │ │
│  │   </ErrorBoundary>           │  │  </ErrorBoundary>                │ │
│  └──────────────────────────────┘  └─────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

If the iframe preview encounters a WebGL or runtime crash:
- The chat panel **remains fully interactive**.
- The top navigation and export buttons **remain functional**.
- The fallback UI provides a localized **"Muat Ulang Preview"** button without requiring a full page refresh.

---

## 2. Standardized Error Classification

Every error in the system must be classified into one of three distinct categories:

1. **User-Facing Actionable Errors**:
   - Validation failures, insufficient energy balance, rate limits.
   - *Handling:* Returned with localized, helpful Indonesian copy; highlighted directly on the relevant form field or toast.
2. **Network Transport Errors**:
   - Timeouts, dropped connections, 502/503 gateway drops.
   - *Handling:* Handled with automatic exponential backoff retry via TanStack Query; surfaces non-destructive offline badges.
3. **System Invariant Panics**:
   - Corrupted state, schema mismatch, unauthorized access.
   - *Handling:* Fail closed immediately. Log structured telemetry in English; display a safe recovery fallback to the user.

---

## 3. Security: Permission-Based Access Control (PBAC)

Never rely solely on client-side role checks. Every mutation must enforce object-level ownership:

```typescript
// ✅ GREAT: Server endpoint validates that the requester OWNS the specific project
export async function handleDeleteProject(req: Request, projectId: string, session: Session) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });

  if (!project) {
    throw new NotFoundError("Proyek tidak ditemukan");
  }

  // Strict ownership invariant
  if (project.userId !== session.userId && session.role !== "ADMIN") {
    throw new UnauthorizedError("Kamu tidak memiliki izin untuk menghapus proyek ini");
  }

  await prisma.project.delete({ where: { id: projectId } });
}
```

Client UI checks (e.g. hiding delete buttons for non-owners) are strictly for **UX polish**, never the actual security gate.

---

## 4. XSS Sanitization at Boundaries

Never render untrusted user input or external HTML without active sanitization:
- **Markdown / Rich Text**: Pass through a dedicated sanitizer (e.g. DOMPurify) before injecting via `dangerouslySetInnerHTML`.
- **URL Attributes**: Validate protocols before rendering `<a href={url}>`. Disallow `javascript:` pseudo-protocols; enforce `https://` or relative paths.

---

## 5. Token & Secret Hygiene

- **Session Tokens**: Store session tokens in `HttpOnly`, `SameSite=Lax`, `Secure` cookies. Never store authentication tokens in `localStorage` or `sessionStorage` where malicious third-party scripts can extract them.
- **Server Secrets**: Environment variables with database credentials, LLM API keys, or payment secrets must NEVER be prefixed with public bundler prefixes (e.g. `VITE_`, `NEXT_PUBLIC_`).
