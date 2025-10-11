# Multiplayer & Authentication

Related: [[architecture]], [[core]], [[models]]

**Status:** Exploration (Pre-Implementation)
**Last Updated:** January 2025

---

## Overview

This document explores authentication and authorization architecture for Agor's multiplayer features. Our goal is to enable multi-user collaboration while preserving the local-first philosophy and minimizing initial configuration burden.

**Key Requirements:**

1. **Local-first default** - Zero config for single-user local development
2. **Progressive enhancement** - Add auth only when needed (team collaboration)
3. **Future-proof** - Support OAuth, SAML, custom identity providers
4. **Developer control** - Own your data, no vendor lock-in
5. **Framework integration** - Work seamlessly with FeathersJS + Drizzle

---

## Architecture Philosophy

### Local-First Auth Model

**V1 (Local Single-User):** Trust-based default

```
User runs locally → Full admin access → No authentication
Rationale: If you control the OS, you control the database anyway
```

**V2 (Local Multi-User):** Optional authentication

```
Team shares daemon → Basic auth (admin/admin) → Simple password protection
Rationale: Lightweight protection for shared dev environments
```

**V3 (Cloud Multi-User):** Full authentication + authorization

```
Cloud deployment → JWT + OAuth → Role-based permissions
Rationale: Production-grade security for team collaboration
```

### Progressive Enhancement Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ V1: Local Single-User (Current)                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ No auth required                                        │ │
│ │ All operations permitted                                │ │
│ │ Database: ~/.agor/agor.db                              │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ V2: Local Multi-User (Optional)                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Anonymous mode: Full access (default)                   │ │
│ │ Admin mode: Username/password (opt-in)                  │ │
│ │ Database: Same local SQLite                            │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ V3: Cloud Multi-User (Future)                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ JWT authentication required                             │ │
│ │ OAuth providers (GitHub, Google, etc.)                  │ │
│ │ Custom SAML/OIDC for enterprises                        │ │
│ │ Role-based permissions (owner, admin, member, viewer)   │ │
│ │ Database: PostgreSQL (Turso/Supabase)                  │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Evaluation

### Option 1: FeathersJS Built-in Authentication

**Pros:**

- ✅ Native integration with existing FeathersJS daemon
- ✅ Zero additional dependencies (already using Feathers)
- ✅ Supports JWT, Local, OAuth strategies out of the box
- ✅ Works with Drizzle ORM (custom user service)
- ✅ WebSocket authentication (critical for real-time sync)
- ✅ Anonymous authentication via custom strategy

**Cons:**

- ⚠️ Manual schema setup (no auto-generation)
- ⚠️ Less modern DX compared to newer libraries
- ⚠️ Requires custom hooks for complex RBAC

**Verdict:** **RECOMMENDED** - Best fit for Agor's architecture

**Implementation:**

```typescript
// apps/agor-daemon/src/services/users.ts
import { AuthenticationService, JWTStrategy } from '@feathersjs/authentication';
import { LocalStrategy } from '@feathersjs/authentication-local';
import { AnonymousStrategy } from './strategies/anonymous';

// Configure authentication service
app.configure(
  authentication({
    secret: process.env.JWT_SECRET || 'local-dev-secret',
    entity: 'user',
    service: 'users',
    authStrategies: ['jwt', 'local', 'anonymous'],
    jwtOptions: {
      header: { typ: 'access' },
      audience: 'https://agor.dev',
      issuer: 'agor',
      algorithm: 'HS256',
      expiresIn: '7d',
    },
  })
);

authentication.register('jwt', new JWTStrategy());
authentication.register('local', new LocalStrategy());
authentication.register('anonymous', new AnonymousStrategy());
```

**Anonymous Strategy (V1/V2 Default):**

```typescript
// apps/agor-daemon/src/strategies/anonymous.ts
import { AuthenticationBaseStrategy } from '@feathersjs/authentication';

export class AnonymousStrategy extends AuthenticationBaseStrategy {
  async authenticate(authentication, params) {
    const { anonymous } = authentication;

    // Check if anonymous mode is enabled in config
    const config = await loadConfig();
    if (!config.daemon?.allowAnonymous) {
      throw new NotAuthenticated('Anonymous access disabled');
    }

    // Return anonymous user with full permissions
    return {
      anonymous: true,
      user: {
        id: 'anonymous',
        role: 'admin', // Full access in local mode
      },
    };
  }
}
```

**Migration Path:**

```typescript
// V1 → V2: Add users table without breaking existing installations
// packages/core/src/db/schema.ts

export const users = sqliteTable('users', {
  user_id: text('user_id').primaryKey(),
  email: text('email').unique(),
  password: text('password'), // bcrypt hashed
  name: text('name'),
  role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }).default('member'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  data: json('data').$type<{
    avatar?: string;
    preferences?: Record<string, unknown>;
  }>(),
});

// Optional table - only created if user enables authentication
// Default: No users table = anonymous mode
```

---

### Option 2: Better Auth

**Pros:**

- ✅ Modern TypeScript-first DX
- ✅ Native Drizzle adapter (auto-generates schema)
- ✅ Built-in OAuth providers (50+)
- ✅ Session management with DB storage
- ✅ Two-factor authentication support

**Cons:**

- ❌ Designed for Next.js/React Server Components
- ❌ No native FeathersJS integration
- ❌ WebSocket auth requires custom adapter
- ⚠️ Additional dependency (~500kb)

**Verdict:** **NOT RECOMMENDED** - Wrong framework fit

---

### Option 3: Auth.js (NextAuth)

**Pros:**

- ✅ Mature ecosystem (widely adopted)
- ✅ Drizzle adapter available
- ✅ Extensive OAuth provider support
- ✅ Session database storage

**Cons:**

- ❌ Next.js-centric (requires adapters for other frameworks)
- ❌ No FeathersJS integration
- ❌ WebSocket authentication not supported
- ⚠️ Moving target (v4 → v5 migration)

**Verdict:** **NOT RECOMMENDED** - Framework mismatch

---

### Option 4: Clerk

**Pros:**

- ✅ Excellent developer experience
- ✅ Hosted auth (zero backend code)
- ✅ Built-in user management UI
- ✅ Organization/team support

**Cons:**

- ❌ Vendor lock-in (data hosted by Clerk)
- ❌ Paid service (cost scales with users)
- ❌ Not local-first (requires internet)
- ❌ Conflicts with Agor's "own your data" philosophy

**Verdict:** **NOT RECOMMENDED** - Philosophical mismatch

---

## Recommended Architecture

### Phase 1: Anonymous Mode (V1 - Current)

**Implementation:** No changes needed

```typescript
// Default behavior: All requests succeed
// No authentication middleware
// No users table
```

**Configuration:**

```yaml
# ~/.agor/config.yaml
daemon:
  allowAnonymous: true # Default
  requireAuth: false # Default
```

---

### Phase 2: Optional Local Auth (V2)

**Implementation:** Add FeathersJS authentication (opt-in)

**Database Schema:**

```typescript
// Conditional migration: Only run if user enables auth
export const users = sqliteTable('users', {
  user_id: text('user_id').primaryKey(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(), // bcrypt
  name: text('name'),
  role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }).default('member'),
  created_at: integer('created_at', { mode: 'timestamp' }),
  data: json('data').$type<{ avatar?: string }>(),
});
```

**Enable Auth:**

```bash
# CLI command to initialize authentication
$ agor auth init

? Enable authentication? (Y/n) y
? Create admin user? (Y/n) y
? Admin email: admin@localhost
? Admin password: [hidden]

✓ Created users table
✓ Created admin user (admin@localhost)
✓ Updated config: requireAuth=true

Next steps:
  1. Restart daemon: cd apps/agor-daemon && pnpm dev
  2. Login: agor auth login
```

**Authentication Flow:**

```typescript
// CLI authentication
$ agor auth login
? Email: admin@localhost
? Password: ****
✓ Authenticated successfully
✓ Token saved to ~/.agor/auth.json

// Token-based requests
const client = createClient('http://localhost:3030', {
  authentication: {
    strategy: 'jwt',
    accessToken: loadToken(), // Load from ~/.agor/auth.json
  }
});

// Anonymous fallback (if auth disabled)
const client = createClient('http://localhost:3030', {
  authentication: {
    strategy: 'anonymous',
  }
});
```

**Hooks for Protected Routes:**

```typescript
// apps/agor-daemon/src/services/sessions.ts
import { authenticate } from '@feathersjs/authentication';

export const sessionHooks = {
  before: {
    all: [
      // Only require auth if enabled in config
      async context => {
        const config = await loadConfig();
        if (config.daemon?.requireAuth) {
          return authenticate('jwt', 'anonymous')(context);
        }
        return context;
      },
    ],
    create: [
      /* ... */
    ],
  },
};
```

---

### Phase 3: Cloud Multi-User (V3)

**Implementation:** Full authentication + authorization

**Database Schema (PostgreSQL):**

```typescript
// Add organization/team support
export const organizations = pgTable('organizations', {
  org_id: text('org_id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  owner_id: text('owner_id').references(() => users.user_id),
  created_at: timestamp('created_at').defaultNow(),
});

export const organizationMembers = pgTable('organization_members', {
  org_id: text('org_id').references(() => organizations.org_id),
  user_id: text('user_id').references(() => users.user_id),
  role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }),
  joined_at: timestamp('joined_at').defaultNow(),
});

// Add ownership to sessions
export const sessions = pgTable('sessions', {
  // ... existing fields
  owner_id: text('owner_id').references(() => users.user_id),
  org_id: text('org_id').references(() => organizations.org_id),
  visibility: text('visibility', { enum: ['private', 'team', 'public'] }).default('private'),
});
```

**OAuth Configuration:**

```typescript
// apps/agor-daemon/src/authentication.ts
import { OAuthStrategy } from '@feathersjs/authentication-oauth';

class GitHubStrategy extends OAuthStrategy {
  async getEntityData(profile) {
    return {
      email: profile.email,
      name: profile.name,
      avatar: profile.avatar_url,
      githubId: profile.id,
    };
  }
}

authentication.register('github', new GitHubStrategy());
authentication.register('google', new GoogleStrategy());
```

**Authorization with CASL:**

```typescript
// packages/core/src/permissions/abilities.ts
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

export function defineAbilitiesFor(user, orgRole) {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

  // Anonymous users (local mode)
  if (user.role === 'admin' && user.id === 'anonymous') {
    can('manage', 'all'); // Full access in local mode
    return build();
  }

  // Authenticated users
  can('read', 'Session', { visibility: 'public' });
  can('manage', 'Session', { owner_id: user.id }); // Own sessions

  // Organization members
  if (orgRole) {
    can('read', 'Session', { org_id: user.org_id, visibility: 'team' });

    if (orgRole === 'admin' || orgRole === 'owner') {
      can('manage', 'Session', { org_id: user.org_id });
      can('manage', 'Board', { org_id: user.org_id });
    }

    if (orgRole === 'member') {
      can('create', 'Session');
      can('update', 'Session', { owner_id: user.id });
    }

    if (orgRole === 'viewer') {
      can('read', 'Session', { org_id: user.org_id });
      cannot('create', 'Session');
    }
  }

  return build();
}
```

**Hook Integration:**

```typescript
// apps/agor-daemon/src/hooks/authorize.ts
import { defineAbilitiesFor } from '@agor/core/permissions';
import { Forbidden } from '@feathersjs/errors';

export const authorize = (action, subject) => async context => {
  const { user } = context.params;
  const ability = defineAbilitiesFor(user, user?.orgRole);

  if (!ability.can(action, subject)) {
    throw new Forbidden(`You cannot ${action} ${subject}`);
  }

  return context;
};

// Usage in service
export const sessionHooks = {
  before: {
    create: [authenticate('jwt'), authorize('create', 'Session')],
    update: [authenticate('jwt'), authorize('update', 'Session')],
    remove: [authenticate('jwt'), authorize('delete', 'Session')],
  },
};
```

---

## Configuration Design

### Config File Structure

```yaml
# ~/.agor/config.yaml

# Daemon settings
daemon:
  port: 3030
  host: localhost

  # Authentication mode
  allowAnonymous: true # V1/V2: Allow unauthenticated access
  requireAuth: false # V3: Require authentication

  # Session management
  jwt:
    secret: 'auto-generated-on-first-run'
    expiresIn: '7d'

  # OAuth providers (V3)
  oauth:
    github:
      clientId: env:GITHUB_CLIENT_ID
      clientSecret: env:GITHUB_CLIENT_SECRET
    google:
      clientId: env:GOOGLE_CLIENT_ID
      clientSecret: env:GOOGLE_CLIENT_SECRET

# Database settings
database:
  type: sqlite # V1/V2: sqlite, V3: postgres
  path: file:~/.agor/agor.db

  # Cloud deployment (V3)
  # url: env:DATABASE_URL

# Permissions (V3)
permissions:
  defaultRole: member # Default role for new users
  enableOrgSupport: false # Enable organizations/teams
```

### Environment Variables

```bash
# V1/V2: No env vars needed (local mode)

# V3: Cloud deployment
export AGOR_DATABASE_URL="postgres://..."
export AGOR_JWT_SECRET="production-secret"
export GITHUB_CLIENT_ID="..."
export GITHUB_CLIENT_SECRET="..."
```

---

## Migration Strategy

### V1 → V2: Enable Authentication (Backward Compatible)

**Step 1:** Add users table (optional migration)

```bash
$ agor auth init
? Enable authentication? Yes
✓ Created users table
✓ Config updated: requireAuth=false, allowAnonymous=true
```

**Step 2:** Create admin user

```bash
$ agor auth create-user
? Email: admin@localhost
? Password: ****
? Role: admin
✓ User created
```

**Step 3:** Gradually require auth

```bash
$ agor config set daemon.requireAuth true
✓ Authentication now required
⚠️  Anonymous fallback still enabled
```

**Step 4:** Disable anonymous mode (fully authenticated)

```bash
$ agor config set daemon.allowAnonymous false
✓ Anonymous access disabled
✓ All requests must provide JWT token
```

---

### V2 → V3: Cloud Deployment

**Step 1:** Migrate to PostgreSQL

```bash
# Export local data
$ agor export --output backup.json

# Deploy PostgreSQL (Turso/Supabase/Neon)
$ agor cloud deploy --provider turso

# Import data
$ agor import --input backup.json --db $DATABASE_URL
```

**Step 2:** Enable OAuth

```bash
$ agor config set oauth.github.clientId $GITHUB_CLIENT_ID
$ agor config set oauth.github.clientSecret $GITHUB_CLIENT_SECRET
$ agor auth test-oauth github
✓ GitHub OAuth configured correctly
```

**Step 3:** Enable organizations

```bash
$ agor config set permissions.enableOrgSupport true
$ agor org create --name "My Team" --slug my-team
✓ Organization created
```

---

## Implementation Checklist

### Phase 1: V1 (Current) - DONE ✅

- [x] No authentication
- [x] Full local access
- [x] SQLite database

### Phase 2: V2 (Optional Auth) - TODO

#### Database Schema

- [ ] Create users table schema
- [ ] Add conditional migration (only if auth enabled)
- [ ] Add `owner_id` to sessions/boards/repos (nullable)

#### Authentication Service

- [ ] Implement FeathersJS authentication service
- [ ] Implement JWT strategy
- [ ] Implement Local strategy (username/password)
- [ ] Implement Anonymous strategy (default)
- [ ] Add bcrypt password hashing

#### CLI Commands

- [ ] `agor auth init` - Initialize authentication
- [ ] `agor auth create-user` - Create user
- [ ] `agor auth login` - Login and save token
- [ ] `agor auth logout` - Clear saved token
- [ ] `agor auth whoami` - Show current user

#### Configuration

- [ ] Add auth config to `~/.agor/config.yaml`
- [ ] Add token storage to `~/.agor/auth.json`
- [ ] Auto-generate JWT secret on first run
- [ ] Support env var override

#### Hooks & Middleware

- [ ] Add conditional authenticate hook
- [ ] Skip auth if `requireAuth=false`
- [ ] Allow anonymous fallback if `allowAnonymous=true`

#### UI Support

- [ ] Add login form to React UI
- [ ] Store JWT token in localStorage
- [ ] Pass token to FeathersJS client
- [ ] Show current user in header

### Phase 3: V3 (Cloud Multi-User) - FUTURE

#### Database Schema

- [ ] Organizations table
- [ ] OrganizationMembers table
- [ ] Add `org_id` to sessions/boards
- [ ] Add `visibility` field (private/team/public)

#### OAuth

- [ ] GitHub OAuth strategy
- [ ] Google OAuth strategy
- [ ] Generic OIDC strategy

#### Permissions

- [ ] Integrate CASL for RBAC
- [ ] Define abilities per role
- [ ] Add authorization hooks
- [ ] Filter queries by permissions

#### Multi-tenancy

- [ ] Organization creation
- [ ] Member invitations
- [ ] Role management
- [ ] Session sharing

---

## Security Considerations

### Local Mode (V1/V2)

**Threat Model:**

- **Attacker has OS access** → Game over (they can read `~/.agor/agor.db` directly)
- **Attacker has network access** → Low risk (daemon binds to localhost)
- **Multiple users on same machine** → Use OS file permissions

**Mitigation:**

```bash
# Restrict database file permissions
chmod 600 ~/.agor/agor.db
chmod 700 ~/.agor/

# Bind daemon to localhost only
$ agor daemon start --host 127.0.0.1
```

### Cloud Mode (V3)

**Threat Model:**

- **Unauthorized access** → Require JWT authentication
- **Session hijacking** → Short-lived tokens + refresh tokens
- **CSRF attacks** → SameSite cookies + CORS restrictions
- **SQL injection** → Drizzle ORM (parameterized queries)

**Mitigation:**

```typescript
// JWT with short expiry
jwtOptions: {
  expiresIn: '15m',  // Access token
}

// Refresh tokens in database
refreshTokens: {
  expiresIn: '30d',
  storage: 'database',
}

// CORS restrictions
cors: {
  origin: ['https://agor.dev', 'https://app.agor.dev'],
  credentials: true,
}

// Rate limiting
rateLimit: {
  max: 100,
  windowMs: 60000, // 1 minute
}
```

---

## Alternative Approaches Considered

### 1. Supabase Auth

**Pros:** Turnkey solution, built-in user management
**Cons:** Vendor lock-in, requires Supabase hosting
**Verdict:** Too opinionated for local-first use case

### 2. Auth0

**Pros:** Enterprise-grade, extensive provider support
**Cons:** Expensive, overkill for small teams, requires internet
**Verdict:** Not suitable for local development

### 3. Keycloak

**Pros:** Self-hosted, open source, supports SAML/OIDC
**Cons:** Heavy (Java), complex setup, requires separate service
**Verdict:** Too complex for V2, possible for V3 enterprise

### 4. Custom JWT Implementation

**Pros:** Full control, minimal dependencies
**Cons:** Security risks (easy to get wrong), lack of OAuth support
**Verdict:** FeathersJS auth is better (battle-tested, OAuth ready)

---

## Open Questions

1. **Workspace vs Organization?**
   - Should we use "workspace" terminology (Slack/Notion) or "organization" (GitHub)?
   - Recommendation: "Organization" (aligns with GitHub OAuth scopes)

2. **Session Sharing Granularity?**
   - Share individual sessions vs entire boards?
   - Recommendation: Board-level sharing (simpler permissions)

3. **Guest Access?**
   - Allow unauthenticated users to view public sessions?
   - Recommendation: Yes for V3 (public session links)

4. **API Keys for Automation?**
   - Support API tokens for CI/CD integration?
   - Recommendation: Yes (personal access tokens, scoped permissions)

5. **WebSocket Authentication?**
   - How to authenticate Socket.IO connections?
   - Recommendation: JWT in connection handshake (FeathersJS built-in)

---

## Next Steps

### Immediate (V2 Prep)

1. **Design users table schema** - Add to Drizzle schema (conditional)
2. **Add FeathersJS authentication** - Install `@feathersjs/authentication`
3. **Implement anonymous strategy** - Default for local mode
4. **Add CLI auth commands** - `agor auth init/login/create-user`

### Short-term (V2 Implementation)

1. **Build authentication UI** - Login form in React
2. **Token management** - Store JWT in `~/.agor/auth.json`
3. **Conditional hooks** - Check `requireAuth` config before enforcing
4. **Documentation** - Guide for enabling authentication

### Long-term (V3 Planning)

1. **OAuth research** - Test GitHub/Google strategies
2. **CASL integration** - Prototype permission system
3. **Multi-tenancy design** - Organization data model
4. **Cloud deployment guide** - Turso/Supabase setup

---

## References

**Internal:**

- [[architecture]] - System architecture
- [[models]] - Data models
- [[core]] - Core primitives

**External:**

- FeathersJS Authentication: https://feathersjs.com/api/authentication/service
- FeathersJS Anonymous Auth: https://docs.feathersjs.com/cookbook/authentication/anonymous.html
- CASL (Authorization): https://casl.js.org/
- Better Auth: https://www.better-auth.com/
- Drizzle ORM: https://orm.drizzle.team/

---

## Summary

**Recommended Approach:**

1. **V1 (Current):** No authentication (trust-based local)
2. **V2 (Next):** FeathersJS authentication with anonymous fallback
3. **V3 (Future):** OAuth + RBAC with CASL

**Key Principles:**

- **Local-first:** Default to anonymous mode (zero config)
- **Progressive:** Add auth only when needed
- **Flexible:** Support OAuth, SAML, custom providers
- **Owned:** Data stays under user control

**Implementation Priority:**

1. Phase 2 (Optional Auth) - 2-3 weeks
2. Documentation - 1 week
3. Phase 3 (Cloud) - 4-6 weeks (future milestone)
