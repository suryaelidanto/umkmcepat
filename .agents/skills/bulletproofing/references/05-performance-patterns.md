# 05 — Performance Patterns & Re-render Defense

Techniques to prevent unnecessary re-rendering, optimize resource loading, and ensure 60fps responsiveness.

---

## 1. The `children` Prop Pattern: The Zero-Cost Re-render Barrier

Many developers reflexively reach for `React.memo()`, `useCallback()`, or `useMemo()` to prevent re-renders, introducing dependency bugs and cognitive overhead.

The cleanest, zero-cost way to isolate an expensive sub-tree from state updates is **component composition using the `children` prop**:

```tsx
// ❌ BAD: Every time `count` updates, <HeavyComponent /> is forcibly re-rendered
function CounterCard() {
  const [count, setCount] = useState(0);

  return (
    <div className="card">
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      <HeavyComponent />
    </div>
  );
}

// ✅ GREAT: <HeavyComponent /> is passed via `children` (isolated VDOM reference)
// It is created outside of CounterCard and will NOT re-render when `count` changes!
function CounterCard({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  return (
    <div className="card">
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      {children}
    </div>
  );
}

// Usage:
<CounterCard>
  <HeavyComponent />
</CounterCard>
```

---

## 2. State Initializer Function (Lazy Initialization)

When initializing state with an expensive computation, passing a direct function call runs that calculation on **every single re-render**, even though React only uses the return value on the very first mount!

```tsx
// ❌ BAD: computeExpensiveTokenTree() is executed on EVERY re-render!
const [tokens, setTokens] = useState(computeExpensiveTokenTree(rawConfig));

// ✅ GREAT: Passing an anonymous function runs it ONCE on initial mount only
const [tokens, setTokens] = useState(() => computeExpensiveTokenTree(rawConfig));
```

---

## 3. The Context Velocity Rule

React Context is designed for **low-velocity data** that changes infrequently across the application lifecycle:
- Themes (`light` vs `dark`)
- Current authenticated user profile
- Language / localization preference

### High-Velocity State Anti-Pattern
Placing high-velocity state (e.g. mouse coordinates, scroll positions, keystroke inputs, streaming token deltas) into a top-level React Context forces **every subscriber across the entire component tree to re-render on every tick**.

**Rule:**
- High-velocity state belongs in **local component state**, **URL search params**, or **atomic subscription stores** (like Zustand selectors or refs).

---

## 4. Route-Level Code Splitting & Dynamic Imports

Heavy third-party libraries must be lazily loaded to keep initial landing page bundle sizes under 150KB:
- **Monaco Code Editor** (~2MB) $\rightarrow$ Lazy load inside code view tab via `React.lazy()` or `client-only`.
- **Markdown AST Parsers** (Unified / Remark / Rehype) $\rightarrow$ Lazy load inside preview pane.
- **Canvas / WebGL Engine** $\rightarrow$ Lazy load when preview runtime is activated.

Never import heavy developer tools or editor packages at the top level of shared layouts or landing page routes.
