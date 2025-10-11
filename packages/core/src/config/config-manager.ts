/**
 * Agor Config Manager
 *
 * Handles loading and saving YAML configuration file.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import type { AgorConfig, AgorContext, ContextKey } from './types';

/**
 * Get Agor home directory (~/.agor)
 */
export function getAgorHome(): string {
  return path.join(os.homedir(), '.agor');
}

/**
 * Get config file path (~/.agor/config.yaml)
 */
export function getConfigPath(): string {
  return path.join(getAgorHome(), 'config.yaml');
}

/**
 * Ensure ~/.agor directory exists
 */
async function ensureAgorHome(): Promise<void> {
  const agorHome = getAgorHome();
  try {
    await fs.access(agorHome);
  } catch {
    await fs.mkdir(agorHome, { recursive: true });
  }
}

/**
 * Load config from ~/.agor/config.yaml
 *
 * Returns default config if file doesn't exist.
 */
export async function loadConfig(): Promise<AgorConfig> {
  const configPath = getConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(content) as AgorConfig;
    return config || {};
  } catch (error) {
    // File doesn't exist or parse error - return default config
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return getDefaultConfig();
    }
    throw new Error(
      `Failed to load config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Save config to ~/.agor/config.yaml
 */
export async function saveConfig(config: AgorConfig): Promise<void> {
  await ensureAgorHome();

  const configPath = getConfigPath();
  const content = yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  await fs.writeFile(configPath, content, 'utf-8');
}

/**
 * Get default config
 */
export function getDefaultConfig(): AgorConfig {
  return {
    context: {},
    defaults: {
      board: 'main',
      agent: 'claude-code',
    },
    display: {
      tableStyle: 'unicode',
      colorOutput: true,
      shortIdLength: 8,
    },
    daemon: {
      port: 3030,
      host: 'localhost',
      allowAnonymous: true, // Default: Allow anonymous access (local mode)
      requireAuth: false, // Default: Do not require authentication
    },
  };
}

/**
 * Get context value
 *
 * @param key - Context key to retrieve
 * @returns Value or undefined if not set
 */
export async function getContext(key: ContextKey): Promise<string | undefined> {
  const config = await loadConfig();
  return config.context?.[key];
}

/**
 * Set context value
 *
 * @param key - Context key to set
 * @param value - Value to set
 */
export async function setContext(key: ContextKey, value: string): Promise<void> {
  const config = await loadConfig();

  if (!config.context) {
    config.context = {};
  }

  config.context[key] = value;

  await saveConfig(config);
}

/**
 * Unset context value
 *
 * @param key - Context key to clear
 */
export async function unsetContext(key: ContextKey): Promise<void> {
  const config = await loadConfig();

  if (config.context && key in config.context) {
    delete config.context[key];
    await saveConfig(config);
  }
}

/**
 * Clear all context
 */
export async function clearContext(): Promise<void> {
  const config = await loadConfig();
  config.context = {};
  await saveConfig(config);
}

/**
 * Get all context values
 */
export async function getAllContext(): Promise<AgorContext> {
  const config = await loadConfig();
  return config.context || {};
}

/**
 * Initialize config file with defaults if it doesn't exist
 */
export async function initConfig(): Promise<void> {
  const configPath = getConfigPath();

  try {
    await fs.access(configPath);
    // File exists, don't overwrite
  } catch {
    // File doesn't exist, create with defaults
    await saveConfig(getDefaultConfig());
  }
}

/**
 * Get a nested config value using dot notation
 *
 * @param key - Config key (e.g., "credentials.ANTHROPIC_API_KEY")
 * @returns Value or undefined if not set
 */
export async function getConfigValue(key: string): Promise<string | boolean | number | undefined> {
  const config = await loadConfig();
  const parts = key.split('.');

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access
  let value: any = config;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Set a nested config value using dot notation
 *
 * @param key - Config key (e.g., "credentials.ANTHROPIC_API_KEY")
 * @param value - Value to set
 */
export async function setConfigValue(key: string, value: string | boolean | number): Promise<void> {
  const config = await loadConfig();
  const parts = key.split('.');

  if (parts.length === 1) {
    // Top-level key (context key)
    if (!config.context) {
      config.context = {};
    }
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access
    (config.context as any)[parts[0]] = value;
  } else {
    // Nested key (e.g., "credentials.ANTHROPIC_API_KEY")
    const section = parts[0];
    const subKey = parts.slice(1).join('.');

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access
    if (!(config as any)[section]) {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access
      (config as any)[section] = {};
    }

    // For now, only support one level of nesting
    if (parts.length === 2) {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access
      (config as any)[section][parts[1]] = value;
    } else {
      throw new Error(`Nested keys beyond one level not supported: ${key}`);
    }
  }

  await saveConfig(config);
}

/**
 * Unset a nested config value using dot notation
 *
 * @param key - Config key to clear
 */
export async function unsetConfigValue(key: string): Promise<void> {
  const config = await loadConfig();
  const parts = key.split('.');

  if (parts.length === 1) {
    // Top-level key (context key)
    if (config.context && parts[0] in config.context) {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access
      delete (config.context as any)[parts[0]];
    }
  } else if (parts.length === 2) {
    const section = parts[0];
    const subKey = parts[1];

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access
    if ((config as any)[section] && subKey in (config as any)[section]) {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic config access
      delete (config as any)[section][subKey];
    }
  }

  await saveConfig(config);
}
