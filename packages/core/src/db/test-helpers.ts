/**
 * Database Test Helpers
 *
 * Shared test utilities used ACROSS multiple test files.
 *
 * Add helpers here ONLY if multiple test files need them:
 * - Shared fixtures (like dbTest below)
 * - Common assertions used by many tests
 * - Seeded database fixtures for integration tests
 *
 * For helpers used within a single test file, keep them inline in that file.
 * Don't add single-use utilities here - keep this file lean.
 */

import { test } from 'vitest';
import { createDatabase, type Database } from './client';
import { initializeDatabase } from './migrate';

/**
 * Test fixture providing fresh in-memory database for each test.
 *
 * Each test gets an isolated SQLite :memory: database with full schema.
 * Cleanup happens automatically after each test.
 *
 * @example
 * ```typescript
 * import { dbTest } from '../test-helpers';
 * import { RepoRepository } from './repos';
 *
 * dbTest('should create repo', async ({ db }) => {
 *   const repo = new RepoRepository(db);
 *   const created = await repo.create({ path: '/test', name: 'test' });
 *   expect(created.id).toBeDefined();
 * });
 * ```
 */
export const dbTest = test.extend<{ db: Database }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright test fixture pattern requires empty destructure
  db: async ({}, use) => {
    // Create fresh in-memory SQLite database
    const db = createDatabase({ url: ':memory:' });

    // Initialize schema (creates all tables, indexes, etc.)
    await initializeDatabase(db);

    // Provide database to test
    await use(db);

    // Cleanup happens automatically when test completes
  },
});
