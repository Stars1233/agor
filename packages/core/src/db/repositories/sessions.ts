/**
 * Session Repository
 *
 * Type-safe CRUD operations for sessions with short ID support.
 */

import type { Session, UUID } from '@agor/core/types';
import { eq, like, or, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { formatShortId, generateId } from '../ids';
import { type SessionInsert, type SessionRow, sessions } from '../schema';
import {
  AmbiguousIdError,
  type BaseRepository,
  EntityNotFoundError,
  RepositoryError,
} from './base';

/**
 * Session repository implementation
 */
export class SessionRepository implements BaseRepository<Session, Partial<Session>> {
  constructor(private db: Database) {}

  /**
   * Convert database row to Session type
   */
  private rowToSession(row: SessionRow): Session {
    const genealogyData = row.data.genealogy || { children: [] };
    const repoData = row.data.repo;

    return {
      session_id: row.session_id as UUID,
      status: row.status,
      agent: row.agent,
      created_at: new Date(row.created_at).toISOString(),
      last_updated: row.updated_at
        ? new Date(row.updated_at).toISOString()
        : new Date(row.created_at).toISOString(),
      created_by: row.created_by,
      ...row.data,
      tasks: row.data.tasks.map(id => id as UUID),
      repo: repoData
        ? {
            ...repoData,
            repo_id: repoData.repo_id as UUID | undefined,
            repo_slug: repoData.repo_slug,
            worktree_name: repoData.worktree_name,
            cwd: repoData.cwd,
            managed_worktree: repoData.managed_worktree,
          }
        : {
            // Default for imported sessions without repo context
            cwd: process.cwd(),
            managed_worktree: false,
          },
      genealogy: {
        parent_session_id: row.parent_session_id as UUID | undefined,
        forked_from_session_id: row.forked_from_session_id as UUID | undefined,
        fork_point_task_id: genealogyData.fork_point_task_id as UUID | undefined,
        spawn_point_task_id: genealogyData.spawn_point_task_id as UUID | undefined,
        children: genealogyData.children.map(id => id as UUID),
      },
      permission_config: row.data.permission_config,
    };
  }

  /**
   * Convert Session to database insert format
   */
  private sessionToInsert(session: Partial<Session>): SessionInsert {
    const now = Date.now();
    const sessionId = session.session_id ?? generateId();

    // DEBUG: Log what we're about to convert
    console.log(`🔧 [sessionToInsert] Converting session to insert format:`);
    console.log(`   session.permission_config: ${JSON.stringify(session.permission_config)}`);

    // Compute CWD based on worktree configuration
    let cwd: string;

    if (session.repo?.managed_worktree && session.repo.repo_slug && session.repo.worktree_name) {
      // For managed worktrees, use ~/.agor/worktrees/{repo}/{worktree}
      const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
      cwd = `${homeDir}/.agor/worktrees/${session.repo.repo_slug}/${session.repo.worktree_name}`;
    } else if (session.repo?.cwd) {
      // Use explicitly provided CWD
      cwd = session.repo.cwd;
    } else {
      // Fall back to process.cwd()
      cwd = process.cwd();
    }

    // Ensure repo has a CWD
    const repo = session.repo
      ? {
          ...session.repo,
          cwd,
        }
      : {
          cwd,
          managed_worktree: false,
        };

    return {
      session_id: sessionId,
      created_at: new Date(session.created_at ? session.created_at : now),
      updated_at: session.last_updated ? new Date(session.last_updated) : new Date(now),
      status: session.status ?? 'idle',
      agent: session.agent ?? 'claude-code',
      created_by: session.created_by ?? 'anonymous',
      board_id: null, // Board ID tracked separately in boards.sessions array
      parent_session_id: session.genealogy?.parent_session_id ?? null,
      forked_from_session_id: session.genealogy?.forked_from_session_id ?? null,
      data: {
        agent_version: session.agent_version,
        agent_session_id: session.agent_session_id, // Preserve Agent SDK session ID
        description: session.description,
        repo,
        git_state: session.git_state ?? {
          ref: 'main',
          base_sha: '',
          current_sha: '',
        },
        genealogy: session.genealogy ?? {
          children: [],
        },
        contextFiles: session.contextFiles ?? [],
        tasks: session.tasks ?? [],
        message_count: session.message_count ?? 0,
        tool_use_count: session.tool_use_count ?? 0,
        permission_config: session.permission_config,
        issue_url: session.issue_url,
        pull_request_url: session.pull_request_url,
      },
    };
  }

  /**
   * Resolve short ID to full ID
   */
  private async resolveId(id: string): Promise<string> {
    // If already a full UUID, return as-is
    if (id.length === 36 && id.includes('-')) {
      return id;
    }

    // Short ID - need to resolve
    const normalized = id.replace(/-/g, '').toLowerCase();
    const pattern = `${normalized}%`;

    const results = await this.db
      .select({ session_id: sessions.session_id })
      .from(sessions)
      .where(like(sessions.session_id, pattern))
      .all();

    if (results.length === 0) {
      throw new EntityNotFoundError('Session', id);
    }

    if (results.length > 1) {
      throw new AmbiguousIdError(
        'Session',
        id,
        results.map(r => formatShortId(r.session_id))
      );
    }

    return results[0].session_id;
  }

  /**
   * Create a new session
   */
  async create(data: Partial<Session>): Promise<Session> {
    try {
      const insert = this.sessionToInsert(data);
      await this.db.insert(sessions).values(insert);

      const row = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.session_id, insert.session_id))
        .get();

      if (!row) {
        throw new RepositoryError('Failed to retrieve created session');
      }

      return this.rowToSession(row);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      throw new RepositoryError(
        `Failed to create session: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Find session by ID (supports short ID)
   */
  async findById(id: string): Promise<Session | null> {
    try {
      const fullId = await this.resolveId(id);
      const row = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.session_id, fullId))
        .get();

      return row ? this.rowToSession(row) : null;
    } catch (error) {
      if (error instanceof EntityNotFoundError) return null;
      if (error instanceof AmbiguousIdError) throw error;
      throw new RepositoryError(
        `Failed to find session: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Find all sessions
   */
  async findAll(): Promise<Session[]> {
    try {
      const rows = await this.db.select().from(sessions).all();
      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      throw new RepositoryError(
        `Failed to find all sessions: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Find sessions by status
   */
  async findByStatus(status: Session['status']): Promise<Session[]> {
    try {
      const rows = await this.db.select().from(sessions).where(eq(sessions.status, status)).all();

      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      throw new RepositoryError(
        `Failed to find sessions by status: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Find sessions by board ID
   */
  async findByBoard(_boardId: string): Promise<Session[]> {
    try {
      // Since board_id is not materialized, we need to filter on the client side
      // or use JSON extraction in SQL
      const rows = await this.db.select().from(sessions).all();

      // For now, return all sessions (board filtering will be done at service layer)
      // TODO: Add board_id as materialized column if frequently filtered
      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      throw new RepositoryError(
        `Failed to find sessions by board: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Find child sessions (forked or spawned from this session)
   */
  async findChildren(sessionId: string): Promise<Session[]> {
    try {
      const fullId = await this.resolveId(sessionId);

      // Query sessions where parent_session_id or forked_from_session_id matches
      const rows = await this.db
        .select()
        .from(sessions)
        .where(
          or(
            sql`json_extract(${sessions.data}, '$.genealogy.parent_session_id') = ${fullId}`,
            sql`json_extract(${sessions.data}, '$.genealogy.forked_from_session_id') = ${fullId}`
          )
        )
        .all();

      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      throw new RepositoryError(
        `Failed to find child sessions: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Find ancestor sessions (parent chain)
   */
  async findAncestors(sessionId: string): Promise<Session[]> {
    try {
      const fullId = await this.resolveId(sessionId);
      const ancestors: Session[] = [];

      let currentSession = await this.findById(fullId);

      while (currentSession) {
        const parentId =
          currentSession.genealogy?.parent_session_id ||
          currentSession.genealogy?.forked_from_session_id;

        if (!parentId) break;

        const parent = await this.findById(parentId);
        if (!parent) break;

        ancestors.push(parent);
        currentSession = parent;
      }

      return ancestors;
    } catch (error) {
      throw new RepositoryError(
        `Failed to find ancestor sessions: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Update session by ID
   */
  async update(id: string, updates: Partial<Session>): Promise<Session> {
    try {
      const fullId = await this.resolveId(id);

      // Get current session to merge updates
      const current = await this.findById(fullId);
      if (!current) {
        throw new EntityNotFoundError('Session', id);
      }

      // Merge updates into current session
      const merged = {
        ...current,
        ...updates,
      };

      // Debug logging for permission_config persistence
      if (updates.permission_config) {
        console.log(`📝 [SessionRepository] Merging permission_config update`);
        console.log(
          `   Before merge - current.permission_config: ${JSON.stringify(current.permission_config)}`
        );
        console.log(`   Update permission_config: ${JSON.stringify(updates.permission_config)}`);
        console.log(
          `   After merge - merged.permission_config: ${JSON.stringify(merged.permission_config)}`
        );
      }

      const insert = this.sessionToInsert(merged);

      // Debug: Log what we're about to write to DB
      console.log(`🗄️  [SessionRepository] Writing to DB:`);
      console.log(
        `   insert.data.permission_config: ${JSON.stringify(insert.data.permission_config)}`
      );

      await this.db
        .update(sessions)
        .set({
          status: insert.status,
          updated_at: new Date(),
          data: insert.data,
        })
        .where(eq(sessions.session_id, fullId));

      console.log(`✅ [SessionRepository] DB update complete`);

      const updated = await this.findById(fullId);
      if (!updated) {
        throw new RepositoryError('Failed to retrieve updated session');
      }

      return updated;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      if (error instanceof EntityNotFoundError) throw error;
      throw new RepositoryError(
        `Failed to update session: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Delete session by ID
   */
  async delete(id: string): Promise<void> {
    try {
      const fullId = await this.resolveId(id);

      const result = await this.db.delete(sessions).where(eq(sessions.session_id, fullId)).run();

      if (result.rowsAffected === 0) {
        throw new EntityNotFoundError('Session', id);
      }
    } catch (error) {
      if (error instanceof EntityNotFoundError) throw error;
      throw new RepositoryError(
        `Failed to delete session: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Find sessions with running tasks
   */
  async findRunning(): Promise<Session[]> {
    return this.findByStatus('running');
  }

  /**
   * Count total sessions
   */
  async count(): Promise<number> {
    try {
      const result = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(sessions)
        .get();

      return result?.count ?? 0;
    } catch (error) {
      throw new RepositoryError(
        `Failed to count sessions: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
}
