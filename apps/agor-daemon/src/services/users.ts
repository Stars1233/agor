/**
 * Users Service
 *
 * Handles user authentication and management.
 * Only active when authentication is enabled via config.
 */

import { generateId } from '@agor/core';
import type { Database } from '@agor/core/db';
import { users } from '@agor/core/db';
import type { User, UserID } from '@agor/core/types';
import type { Paginated, Params } from '@feathersjs/feathers';
import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';

/**
 * Create user input
 */
interface CreateUserData {
  email: string;
  password: string;
  name?: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
}

/**
 * Update user input
 */
interface UpdateUserData {
  email?: string;
  password?: string;
  name?: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
  avatar?: string;
  preferences?: Record<string, unknown>;
}

/**
 * Users Service Methods
 */
export class UsersService {
  constructor(private db: Database) {}

  /**
   * Find all users (supports filtering by email for authentication)
   */
  async find(params?: Params): Promise<Paginated<User>> {
    // Check if filtering by email (for authentication)
    const email = params?.query?.email as string | undefined;
    const includePassword = !!email; // Include password when looking up by email (for authentication)

    let rows: (typeof users.$inferSelect)[];
    if (email) {
      // Find by email (for LocalStrategy)
      const row = await this.db.select().from(users).where(eq(users.email, email)).get();
      rows = row ? [row] : [];
    } else {
      // Find all
      rows = await this.db.select().from(users).all();
    }

    const results = rows.map(row => this.rowToUser(row, includePassword));

    return {
      total: results.length,
      limit: results.length,
      skip: 0,
      data: results,
    };
  }

  /**
   * Get user by ID
   */
  async get(id: UserID, _params?: Params): Promise<User> {
    const row = await this.db.select().from(users).where(eq(users.user_id, id)).get();

    if (!row) {
      throw new Error(`User not found: ${id}`);
    }

    return this.rowToUser(row);
  }

  /**
   * Create new user
   */
  async create(data: CreateUserData, _params?: Params): Promise<User> {
    // Check if email already exists
    const existing = await this.db.select().from(users).where(eq(users.email, data.email)).get();

    if (existing) {
      throw new Error(`User with email ${data.email} already exists`);
    }

    // Hash password
    const hashedPassword = await hash(data.password, 10);

    // Create user
    const now = new Date();
    const user_id = generateId() as UserID;

    const row = await this.db
      .insert(users)
      .values({
        user_id,
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role || 'member',
        created_at: now,
        updated_at: now,
        data: {
          preferences: {},
        },
      })
      .returning()
      .get();

    return this.rowToUser(row);
  }

  /**
   * Update user
   */
  async patch(id: UserID, data: UpdateUserData, _params?: Params): Promise<User> {
    const now = new Date();
    const updates: Record<string, unknown> = { updated_at: now };

    // Handle password separately (needs hashing)
    if (data.password) {
      updates.password = await hash(data.password, 10);
    }

    // Update other fields
    if (data.email) updates.email = data.email;
    if (data.name) updates.name = data.name;
    if (data.role) updates.role = data.role;

    // Update data blob
    if (data.avatar || data.preferences) {
      const current = await this.get(id);
      updates.data = {
        avatar: data.avatar ?? current.avatar,
        preferences: data.preferences ?? current.preferences,
      };
    }

    const row = await this.db
      .update(users)
      .set(updates)
      .where(eq(users.user_id, id))
      .returning()
      .get();

    if (!row) {
      throw new Error(`User not found: ${id}`);
    }

    return this.rowToUser(row);
  }

  /**
   * Delete user
   */
  async remove(id: UserID, _params?: Params): Promise<User> {
    const user = await this.get(id);

    await this.db.delete(users).where(eq(users.user_id, id)).run();

    return user;
  }

  /**
   * Find user by email (for authentication)
   */
  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.select().from(users).where(eq(users.email, email)).get();

    return row ? this.rowToUser(row) : null;
  }

  /**
   * Verify password
   */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    // Need to fetch password from database (not in User type)
    const row = await this.db.select().from(users).where(eq(users.user_id, user.user_id)).get();

    if (!row) return false;

    return compare(password, row.password);
  }

  /**
   * Convert database row to User type
   *
   * @param row - Database row
   * @param includePassword - Include password field (for authentication only)
   */
  private rowToUser(
    row: typeof users.$inferSelect,
    includePassword = false
  ): User & { password?: string } {
    const data = row.data as { avatar?: string; preferences?: Record<string, unknown> };

    const user: User & { password?: string } = {
      user_id: row.user_id as UserID,
      email: row.email,
      name: row.name ?? undefined,
      role: row.role as 'owner' | 'admin' | 'member' | 'viewer',
      avatar: data.avatar,
      preferences: data.preferences,
      created_at: row.created_at,
      updated_at: row.updated_at ?? undefined,
    };

    // Include password for authentication (FeathersJS LocalStrategy needs this)
    if (includePassword) {
      user.password = row.password;
    }

    return user;
  }
}

/**
 * User service with password field for authentication
 * This version includes the password field for FeathersJS local strategy
 */
interface UserWithPassword extends User {
  password: string;
}

/**
 * Users service with authentication support
 */
class UsersServiceWithAuth extends UsersService {
  /**
   * Override get to include password for authentication
   * (FeathersJS LocalStrategy needs this)
   */
  async getWithPassword(id: UserID): Promise<UserWithPassword> {
    const row = await this.db.select().from(users).where(eq(users.user_id, id)).get();

    if (!row) {
      throw new Error(`User not found: ${id}`);
    }

    const data = row.data as { avatar?: string; preferences?: Record<string, unknown> };

    return {
      user_id: row.user_id as UserID,
      email: row.email,
      password: row.password, // Include for authentication
      name: row.name ?? undefined,
      role: row.role as 'owner' | 'admin' | 'member' | 'viewer',
      avatar: data.avatar,
      preferences: data.preferences,
      created_at: row.created_at,
      updated_at: row.updated_at ?? undefined,
    };
  }
}

/**
 * Create users service
 */
export function createUsersService(db: Database): UsersServiceWithAuth {
  return new UsersServiceWithAuth(db);
}
