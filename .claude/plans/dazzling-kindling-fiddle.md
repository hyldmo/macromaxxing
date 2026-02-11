# Replace Cloudflare Access with Clerk Auth

## Context

Cloudflare Access is a Zero Trust corporate gating tool, not user-facing auth. We need real user sign-up/sign-in. Clerk is a managed auth service (50k MAU free tier) that handles OAuth (Google/GitHub), session management, and provides React UI components.

## What Clerk handles for us (no custom code needed)

- OAuth flows with Google/GitHub (redirect, token exchange, etc.)
- Session management (JWT-based, `__session` cookie)
- Sign-in/sign-up UI (modal or redirect, with theming)
- User management (email, avatar, profile)

## Files to modify/create

| File | Action |
|------|--------|
| `package.json` | Add `@clerk/clerk-react` |
| `workers/package.json` | Add `@hono/clerk-auth` |
| `packages/db/schema.ts` | Add `clerkId` column to users |
| `packages/db/relations.ts` | No change needed |
| `packages/db/types.ts` | No change needed |
| `workers/functions/api/[[route]].ts` | Add `clerkMiddleware()`, pass context to auth |
| `workers/functions/lib/auth.ts` | Rewrite: Clerk session instead of CF-Access header |
| `workers/worker-configuration.d.ts` | Add `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| `vite.config.ts` | No change (cookies forwarded by existing `/api` proxy) |
| `src/main.tsx` | Wrap with `<ClerkProvider>` |
| `src/lib/user.tsx` | Remove login/logout, gate `user.me` query on Clerk auth state |
| `src/lib/trpc.ts` | No change (`credentials: 'include'` already sends cookies) |
| `src/components/layout/Nav.tsx` | Replace login/logout buttons with Clerk `<SignInButton>` / `<UserButton>` |
| `src/router.tsx` | No change |
| `CLAUDE.md` | Update Auth description |
| `.env.local` | Add `VITE_CLERK_PUBLISHABLE_KEY` |

## Implementation steps

### 1. Install dependencies

```bash
yarn add @clerk/clerk-react
yarn workspace @macromaxxing/workers add @hono/clerk-auth
```

### 2. Schema: add `clerkId` to users table

`packages/db/schema.ts` — add one column:

```ts
clerkId: text('clerk_id').unique()  // nullable for existing CF-Access users
```

Generate + apply migration: `yarn db:generate && yarn db:migrate`

### 3. Update `workers/functions/api/[[route]].ts`

Add Clerk middleware before tRPC handler, pass Hono context to auth:

```ts
import { clerkMiddleware } from '@hono/clerk-auth'

app.use('*', cors())
app.use('*', clerkMiddleware())

// In createContext: pass `c` (Hono context) to authenticateRequest
user = await authenticateRequest(req, db, isDev, c)
```

### 4. Rewrite `workers/functions/lib/auth.ts`

Replace CF-Access header reading with Clerk session verification:

```ts
import { getAuth } from '@hono/clerk-auth'

export async function authenticateRequest(request, db, isDev, c): Promise<AuthUser> {
  // 1. Check Clerk auth (production + dev with Clerk)
  const auth = getAuth(c)
  if (auth?.userId) {
    // Look up D1 user by clerkId
    const existing = await db.select().from(users).where(eq(users.clerkId, auth.userId)).get()
    if (existing) return { id: existing.id, email: existing.email }

    // First login - get email from Clerk API, create D1 user
    const clerkClient = c.get('clerk')
    const clerkUser = await clerkClient.users.getUser(auth.userId)
    const email = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress

    // Check if user exists by email (migration from old CF Access users)
    const byEmail = await db.select().from(users).where(eq(users.email, email)).get()
    if (byEmail) {
      await db.update(users).set({ clerkId: auth.userId }).where(eq(users.id, byEmail.id))
      return { id: byEmail.id, email: byEmail.email }
    }

    // Create new user
    const userId = newId('usr')
    await db.insert(users).values({ id: userId, clerkId: auth.userId, email, createdAt: Date.now() })
    return { id: userId, email }
  }

  // 2. Dev mode fallback (X-Dev-User-Email header)
  if (isDev) {
    const devEmail = request.headers.get('X-Dev-User-Email')
    if (devEmail) { /* find/create dev user, same as current */ }
  }

  throw new Error('Not authenticated')
}
```

Clerk API call only happens once per user (first login). After that, user is found by `clerkId`.

### 5. Frontend: `src/main.tsx`

Wrap app with `<ClerkProvider>` (outermost):

```tsx
import { ClerkProvider } from '@clerk/clerk-react'

const CLERK_PK = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

<ClerkProvider publishableKey={CLERK_PK} afterSignOutUrl="/">
  <trpc.Provider ...>
    <QueryClientProvider ...>
      <UserProvider>
        <RouterProvider router={router} />
      </UserProvider>
    </QueryClientProvider>
  </trpc.Provider>
</ClerkProvider>
```

### 6. Frontend: `src/lib/user.tsx`

- Remove `login()` and `logout()` exports (Clerk handles these)
- Gate `user.me` query on Clerk sign-in state:

```tsx
import { useAuth } from '@clerk/clerk-react'

export const UserProvider: FC<...> = ({ children }) => {
  const { isSignedIn, isLoaded } = useAuth()
  const { data, isLoading } = trpc.user.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: isSignedIn === true
  })
  return <UserContext.Provider value={{ user: data ?? null, isLoading: !isLoaded || isLoading }}>...
}
```

### 7. Frontend: `src/components/layout/Nav.tsx`

Replace custom login/logout buttons with Clerk components:

```tsx
import { SignInButton, UserButton, SignedIn, SignedOut } from '@clerk/clerk-react'

// Desktop:
<SignedIn>
  <UserButton />
</SignedIn>
<SignedOut>
  <SignInButton mode="modal">
    <button className="..."><LogIn /> Sign in</button>
  </SignInButton>
</SignedOut>

// Mobile: same pattern
```

Remove imports of `login`, `logout` from `~/lib/user`.

### 8. Environment variables

**Frontend** (`.env.local`, not committed):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**Workers** (`.dev.vars` locally, Cloudflare dashboard for production):
```
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

**Cloudflare Pages build** (dashboard): set `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...`

**`worker-configuration.d.ts`**: Add `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` fields.

### 9. Update CLAUDE.md

Change Auth line to: `Cookie-based via Clerk (Google/GitHub OAuth), user ID in context`

## Clerk dashboard setup (user action)

1. Create Clerk application at clerk.com
2. Enable Google and GitHub as social connections
3. Get publishable key + secret key
4. Configure Google OAuth credentials (client ID/secret from Google Cloud Console)
5. Configure GitHub OAuth credentials (from GitHub Developer Settings)

## Verification

1. `yarn dev` — frontend + API running
2. Click "Sign in" → Clerk modal appears with Google/GitHub options
3. Sign in with Google → modal closes, user authenticated
4. `user.me` tRPC query returns D1 user data
5. Nav shows Clerk `<UserButton>` with avatar/dropdown
6. Sign out via UserButton dropdown → user becomes null
7. Public endpoints (listPublic, getPublic) still work without auth
8. Dev mode: `X-Dev-User-Email` header still works as fallback
