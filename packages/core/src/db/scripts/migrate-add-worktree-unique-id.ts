/**
 * Migration: Add worktree_unique_id column
 *
 * Adds worktree_unique_id column to worktrees table for environment templating.
 * Auto-assigns sequential IDs to existing worktrees.
 */

import { createDatabase } from '../index';

const DB_PATH = process.env.AGOR_DB_PATH || 'file:~/.agor/agor.db';

async function migrate() {
  console.log('📦 Connecting to database:', DB_PATH);
  const db = createDatabase({ url: DB_PATH });

  console.log('🔄 Running migration: Add worktree_unique_id column...');

  try {
    // Check if column already exists
    const tableInfo = await db.all("PRAGMA table_info('worktrees')");
    const hasColumn = tableInfo.some((col: any) => col.name === 'worktree_unique_id');

    if (hasColumn) {
      console.log('✅ Column worktree_unique_id already exists, skipping migration');
      return;
    }

    // Get existing worktrees
    const existingWorktrees = await db.all<Array<{ worktree_id: string }>>(
      'SELECT worktree_id FROM worktrees ORDER BY created_at ASC'
    );

    console.log(`📋 Found ${existingWorktrees.length} existing worktrees`);

    // SQLite doesn't support adding NOT NULL columns directly, so we need to:
    // 1. Add column as nullable
    // 2. Update all existing rows
    // 3. Recreate table with NOT NULL constraint

    // Step 1: Add column as nullable
    await db.run('ALTER TABLE worktrees ADD COLUMN worktree_unique_id INTEGER');
    console.log('✅ Added worktree_unique_id column (nullable)');

    // Step 2: Assign sequential IDs to existing worktrees
    let id = 1;
    for (const worktree of existingWorktrees) {
      await db.run(
        'UPDATE worktrees SET worktree_unique_id = ? WHERE worktree_id = ?',
        id,
        worktree.worktree_id
      );
      console.log(`  ✓ Assigned ID ${id} to worktree ${worktree.worktree_id.substring(0, 8)}`);
      id++;
    }

    console.log(`✅ Assigned unique IDs to ${existingWorktrees.length} worktrees`);

    // Step 3: Recreate table with NOT NULL constraint
    // (We'll skip this for now - SQLite ALTER TABLE limitations)
    // The schema will enforce NOT NULL for new rows
    console.log('⚠️  Note: New worktrees will require worktree_unique_id');

    console.log('');
    console.log('✅ Migration complete!');
    console.log('');
    console.log('Changes:');
    console.log('  - Added worktree_unique_id column to worktrees table');
    console.log(`  - Assigned sequential IDs to ${existingWorktrees.length} existing worktrees`);
    console.log('');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrate()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
