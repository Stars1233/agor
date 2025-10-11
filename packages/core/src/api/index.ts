/**
 * Feathers Client for Agor
 *
 * Shared client library for connecting to agor-daemon from CLI and UI
 */

import type { Board, Repo, Session, Task, User } from '@agor/core/types';
import authentication from '@feathersjs/authentication-client';
import type { Application, Paginated, Params } from '@feathersjs/feathers';
import { feathers } from '@feathersjs/feathers';
import socketio from '@feathersjs/socketio-client';
import io, { type Socket } from 'socket.io-client';

/**
 * Service interfaces for type safety
 */
export interface ServiceTypes {
  sessions: Session;
  tasks: Task;
  boards: Board;
  repos: Repo;
  users: User;
}

/**
 * Feathers service with find method properly typed
 */
export interface AgorService<T> {
  find(params?: Params): Promise<Paginated<T> | T[]>;
  get(id: string, params?: Params): Promise<T>;
  create(data: Partial<T>, params?: Params): Promise<T>;
  update(id: string, data: T, params?: Params): Promise<T>;
  patch(id: string, data: Partial<T>, params?: Params): Promise<T>;
  remove(id: string, params?: Params): Promise<T>;
}

/**
 * Agor client with socket.io connection exposed for lifecycle management
 */
export interface AgorClient extends Application<ServiceTypes> {
  io: Socket;
}

/**
 * Create Feathers client connected to agor-daemon
 *
 * @param url - Daemon URL (default: http://localhost:3030)
 * @returns Feathers client instance with socket exposed
 */
export function createClient(url: string = 'http://localhost:3030'): AgorClient {
  const socket = io(url);
  const client = feathers<ServiceTypes>() as AgorClient;

  client.configure(socketio(socket));

  // Configure authentication with localStorage if available (browser only)
  const storage =
    typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as typeof globalThis & { localStorage: Storage }).localStorage
      : undefined;

  client.configure(authentication({ storage }));
  client.io = socket;

  return client;
}

/**
 * Check if daemon is running
 *
 * @param url - Daemon URL
 * @returns true if daemon is reachable
 */
export async function isDaemonRunning(url: string = 'http://localhost:3030'): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}
