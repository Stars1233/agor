/**
 * Agor Configuration Types
 */

/**
 * Active CLI context (stateful)
 *
 * Values that change frequently during CLI usage.
 */
export interface AgorContext {
  /** Active board (slug, ID, or name) */
  board?: string;

  /** Active session (full UUID or short ID) */
  session?: string;

  /** Active repo reference (path | slug | slug:worktree) */
  repo?: string;

  /** Preferred agent for new sessions */
  agent?: string;
}

/**
 * Global default values
 */
export interface AgorDefaults {
  /** Default board for new sessions */
  board?: string;

  /** Default agent for new sessions */
  agent?: string;
}

/**
 * Display settings
 */
export interface AgorDisplaySettings {
  /** Table style: unicode, ascii, or minimal */
  tableStyle?: 'unicode' | 'ascii' | 'minimal';

  /** Enable color output */
  colorOutput?: boolean;

  /** Short ID length (default: 8) */
  shortIdLength?: number;
}

/**
 * Daemon settings
 */
export interface AgorDaemonSettings {
  /** Daemon port (default: 3030) */
  port?: number;

  /** Daemon host (default: localhost) */
  host?: string;

  /** Allow anonymous access (default: true for local mode) */
  allowAnonymous?: boolean;

  /** Require authentication for all requests (default: false) */
  requireAuth?: boolean;

  /** JWT secret (auto-generated if not provided) */
  jwtSecret?: string;
}

/**
 * Tool credentials (API keys, tokens, etc.)
 */
export interface AgorCredentials {
  /** Anthropic API key for Claude Code */
  ANTHROPIC_API_KEY?: string;

  /** Cursor API key (if needed) */
  CURSOR_API_KEY?: string;

  /** OpenAI API key for Codex */
  OPENAI_API_KEY?: string;

  /** Google API key for Gemini */
  GOOGLE_API_KEY?: string;
}

/**
 * Complete Agor configuration
 */
export interface AgorConfig {
  /** Active context (stateful CLI) */
  context?: AgorContext;

  /** Global defaults */
  defaults?: AgorDefaults;

  /** Display settings */
  display?: AgorDisplaySettings;

  /** Daemon settings */
  daemon?: AgorDaemonSettings;

  /** Tool credentials (API keys, tokens) */
  credentials?: AgorCredentials;
}

/**
 * Valid context keys that can be set/get
 */
export type ContextKey = keyof AgorContext;

/**
 * Valid config keys (includes nested keys with dot notation)
 */
export type ConfigKey =
  | ContextKey
  | `defaults.${keyof AgorDefaults}`
  | `display.${keyof AgorDisplaySettings}`
  | `daemon.${keyof AgorDaemonSettings}`
  | `credentials.${keyof AgorCredentials}`;
