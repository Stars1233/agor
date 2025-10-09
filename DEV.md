# Development Workflow

## The 504 "Outdated Optimize Dep" Fix

We've fixed the Vite hot reload issues! Here's what was changed:

### Root Cause

When `@agor/core` rebuilds (in watch mode), Vite's pre-bundled dependencies become stale, causing 504 errors.

### Solution

Updated `apps/agor-ui/vite.config.ts` to:

1. **Exclude workspace deps from pre-bundling** - `optimizeDeps.exclude: ['@agor/core']`
2. **Watch workspace package dist files** - Monitors changes in `@agor/core/dist`
3. **Allow monorepo file access** - `fs.allow: ['../..']`

This forces Vite to always use the latest built version of `@agor/core` instead of a stale pre-bundled copy.

## Recommended Development Setup

### Terminal 1: Watch @agor/core

```bash
cd packages/core
pnpm dev  # Runs tsup --watch
```

This watches `src/` and rebuilds to `dist/` on changes.

### Terminal 2: Run agor-ui dev server

```bash
cd apps/agor-ui
pnpm dev  # Runs vite
```

Vite will now automatically reload when `@agor/core/dist` changes!

### Terminal 3: (Optional) Run daemon

```bash
cd apps/agor-daemon
pnpm dev  # Runs tsx --watch
```

## What Changed

**Before:**

- Vite pre-bundled `@agor/core` into `.vite/deps/@agor_core.js`
- When core rebuilt, Vite used stale cache → 504 errors
- Required manual page refresh or server restart

**After:**

- Vite skips pre-bundling for `@agor/core`
- Directly imports from `packages/core/dist/`
- Auto-reloads when dist files change
- No more 504 errors! 🎉

## Troubleshooting

### If you still see 504 errors:

1. **Clear Vite cache:**

   ```bash
   cd apps/agor-ui
   rm -rf node_modules/.vite
   pnpm dev
   ```

2. **Rebuild @agor/core:**

   ```bash
   cd packages/core
   pnpm build
   ```

3. **Hard refresh browser:**
   - Chrome/Edge: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
   - Firefox: `Cmd+Shift+R` (Mac) or `Ctrl+F5` (Windows)

### If hot reload isn't working:

Check that both watch processes are running:

```bash
# Terminal 1
cd packages/core && pnpm dev

# Terminal 2
cd apps/agor-ui && pnpm dev
```

## Key Files Modified

- `apps/agor-ui/vite.config.ts` - Added optimizeDeps and server config
- This file (`DEV.md`) - Documentation

## Additional Tips

- **Storybook**: Also benefits from this fix when running `pnpm storybook`
- **TypeScript**: Run `pnpm typecheck` in both packages to catch type errors early
- **Clean slate**: If things get really weird, `pnpm install` from monorepo root
