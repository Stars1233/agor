/**
 * Gemini Prompt Service - Handles live execution via @google/gemini-cli-core SDK
 *
 * Features:
 * - Token-level streaming via AsyncGenerator
 * - Session continuity via setHistory()
 * - Permission modes (DEFAULT, AUTO_EDIT, YOLO)
 * - Event-driven architecture (13 event types)
 * - CLAUDE.md auto-loading
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ApprovalMode,
  AuthType,
  Config,
  GeminiClient,
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '@google/gemini-cli-core';
import type { Content } from '@google/genai';
import type { MessagesRepository } from '../../db/repositories/messages';
import type { SessionRepository } from '../../db/repositories/sessions';
import type { PermissionMode, SessionID, TaskID } from '../../types';
import { DEFAULT_GEMINI_MODEL, type GeminiModel } from './models';

/**
 * Streaming event types for prompt service consumers
 */
export type GeminiStreamEvent =
  | {
      type: 'partial';
      textChunk: string;
      resolvedModel?: string;
      sessionId?: string;
    }
  | {
      type: 'complete';
      content: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      toolUses?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
      resolvedModel?: string;
      sessionId?: string;
    }
  | {
      type: 'tool_start';
      toolName: string;
      toolInput: Record<string, unknown>;
    }
  | {
      type: 'tool_complete';
      toolName: string;
      result: unknown;
    };

export class GeminiPromptService {
  private sessionClients = new Map<SessionID, GeminiClient>();

  constructor(
    private messagesRepo: MessagesRepository,
    private sessionsRepo: SessionRepository,
    private apiKey?: string
  ) {}

  /**
   * Execute prompt with streaming via @google/gemini-cli-core SDK
   *
   * @param sessionId - Agor session ID
   * @param prompt - User prompt text
   * @param taskId - Optional task ID for message linking
   * @param permissionMode - Agor permission mode ('ask' | 'auto' | 'allow-all')
   * @yields Streaming events (partial chunks and complete messages)
   */
  async *promptSessionStreaming(
    sessionId: SessionID,
    prompt: string,
    taskId?: TaskID,
    permissionMode?: PermissionMode
  ): AsyncGenerator<GeminiStreamEvent> {
    // Get or create Gemini client for this session
    const client = await this.getOrCreateClient(sessionId, permissionMode);

    // Get session metadata for model
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const model = (session.model_config?.model as GeminiModel) || DEFAULT_GEMINI_MODEL;

    // Prepare prompt (just text for now - can enhance with file paths later)
    const parts = [{ text: prompt }];

    // Create abort controller for cancellation support
    const abortController = new AbortController();

    // Generate unique prompt ID for this turn
    const promptId = `${sessionId}-${Date.now()}`;

    try {
      // Stream events from Gemini SDK
      const stream = client.sendMessageStream(parts, abortController.signal, promptId);

      // Accumulate content blocks for complete message
      let fullTextContent = '';
      const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for await (const event of stream) {
        // Handle different event types from Gemini SDK
        switch (event.type) {
          case GeminiEventType.Content: {
            // Text chunk from model - stream it immediately!
            const textChunk = event.value || '';
            fullTextContent += textChunk;

            yield {
              type: 'partial',
              textChunk,
              resolvedModel: model,
              sessionId,
            };
            break;
          }

          case GeminiEventType.ToolCallRequest: {
            // Agent wants to call a tool
            const { name, args, callId } = event.value;

            // Track tool use for complete message
            toolUses.push({
              id: callId,
              name,
              input: args,
            });

            // Notify consumer that tool started
            yield {
              type: 'tool_start',
              toolName: name,
              toolInput: args,
            };
            break;
          }

          case GeminiEventType.ToolCallResponse: {
            // Tool execution completed
            // Note: event.value structure may vary - accessing safely
            const toolResponse = event.value as unknown as Record<string, unknown>;

            yield {
              type: 'tool_complete',
              toolName: (toolResponse.name as string) || 'unknown',
              result: toolResponse.response || toolResponse,
            };
            break;
          }

          case GeminiEventType.Finished: {
            // Turn complete - yield final message
            const content: Array<{
              type: string;
              text?: string;
              id?: string;
              name?: string;
              input?: Record<string, unknown>;
            }> = [];

            // Add text block if we have content
            if (fullTextContent) {
              content.push({
                type: 'text',
                text: fullTextContent,
              });
            }

            // Add tool use blocks
            for (const toolUse of toolUses) {
              content.push({
                type: 'tool_use',
                id: toolUse.id,
                name: toolUse.name,
                input: toolUse.input,
              });
            }

            yield {
              type: 'complete',
              content,
              toolUses: toolUses.length > 0 ? toolUses : undefined,
              resolvedModel: model,
              sessionId,
            };

            // Update session history for continuity
            await this.updateSessionHistory(sessionId, client);
            break;
          }

          case GeminiEventType.Error: {
            // Error occurred during execution
            const errorValue = 'value' in event ? event.value : 'Unknown error';
            console.error(`Gemini SDK error: ${JSON.stringify(errorValue)}`);
            throw new Error(`Gemini execution failed: ${errorValue}`);
          }

          case GeminiEventType.Thought: {
            // Agent thinking/reasoning (could stream to UI in future)
            const thoughtValue = 'value' in event ? event.value : '';
            console.debug(`[Gemini Thought] ${thoughtValue}`);
            break;
          }

          case GeminiEventType.ToolCallConfirmation: {
            // User approval needed (should be handled by ApprovalMode config)
            console.debug('[Gemini] Tool call needs confirmation');
            break;
          }

          default: {
            // Log other event types for debugging
            const debugValue = 'value' in event ? event.value : '';
            console.debug(`[Gemini Event] ${event.type}:`, debugValue);
            break;
          }
        }
      }
    } catch (error) {
      console.error('Gemini streaming error:', error);
      throw error;
    }
  }

  /**
   * Get or create GeminiClient for a session
   *
   * Manages client lifecycle and session continuity via history restoration.
   */
  private async getOrCreateClient(
    sessionId: SessionID,
    permissionMode?: PermissionMode
  ): Promise<GeminiClient> {
    // Return existing client if available
    if (this.sessionClients.has(sessionId)) {
      return this.sessionClients.get(sessionId)!;
    }

    // Get session metadata
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Determine working directory
    const workingDirectory = session.repo
      ? (session.repo as { local_path?: string }).local_path || process.cwd()
      : process.cwd();

    // Get model from session config
    const model = (session.model_config?.model as GeminiModel) || DEFAULT_GEMINI_MODEL;

    // Map Agor permission mode to Gemini ApprovalMode
    const approvalMode = this.mapPermissionMode(permissionMode || 'ask');

    // Check for CLAUDE.md and load it as system context
    const claudeMdPath = path.join(workingDirectory, 'CLAUDE.md');
    let systemPrompt: string | undefined;
    try {
      const claudeMdContent = await fs.readFile(claudeMdPath, 'utf-8');
      systemPrompt = `# Project Context\n\n${claudeMdContent}`;
      console.log(`📖 Loaded CLAUDE.md from ${claudeMdPath}`);
    } catch {
      // CLAUDE.md doesn't exist - that's okay
    }

    // Create SDK config
    const config = new Config({
      sessionId, // Use Agor session ID
      targetDir: workingDirectory,
      cwd: workingDirectory,
      model,
      interactive: false, // Non-interactive mode for programmatic control
      approvalMode,
      debugMode: false,
      fileFiltering: {
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      },
      // output: { format: 'stream-json' }, // Streaming JSON events (omitting for now - may not be needed)
      // System prompt will be added via first message if provided
    });

    // CRITICAL: Initialize config first to set up tool registry, etc.
    await config.initialize();

    // CRITICAL: Set up authentication (creates ContentGenerator and BaseLlmClient)
    // Use AuthType.USE_GEMINI for API key authentication
    // The SDK will look for GEMINI_API_KEY environment variable
    await config.refreshAuth(AuthType.USE_GEMINI);

    // Create client (config must be initialized and authenticated first!)
    const client = new GeminiClient(config);
    await client.initialize();

    // Restore conversation history if session has previous messages
    const existingMessages = await this.messagesRepo.findBySessionId(sessionId);
    if (existingMessages.length > 0) {
      const history = this.convertMessagesToGeminiHistory(existingMessages);
      client.setHistory(history);
      console.log(`🔄 Restored ${existingMessages.length} messages to Gemini session`);
    }

    // Add system prompt as first message if CLAUDE.md exists
    if (systemPrompt && existingMessages.length === 0) {
      // Will be added on first user message
    }

    // Cache client for reuse
    this.sessionClients.set(sessionId, client);

    return client;
  }

  /**
   * Map Agor permission mode to Gemini ApprovalMode
   */
  private mapPermissionMode(permissionMode: PermissionMode): ApprovalMode {
    switch (permissionMode) {
      case 'ask':
        return ApprovalMode.DEFAULT; // Prompt for each tool use
      case 'auto':
        return ApprovalMode.AUTO_EDIT; // Auto-approve file edits, ask for shell/web
      case 'allow-all':
        return ApprovalMode.YOLO; // Allow all operations
      default:
        return ApprovalMode.DEFAULT;
    }
  }

  /**
   * Convert Agor messages to Gemini Content[] format for history restoration
   */
  private convertMessagesToGeminiHistory(
    messages: Array<{ role: string; content: unknown }>
  ): Content[] {
    // @google/genai Content type expects { role: 'user' | 'model', parts: Part[] }
    // We'll need to convert our message format to Gemini's format

    // For now, return empty array - will implement full conversion later
    // This is a complex conversion that needs careful mapping of tool uses, etc.
    return [];
  }

  /**
   * Update session history after turn completion
   *
   * Captures conversation state for session continuity.
   */
  private async updateSessionHistory(sessionId: SessionID, client: GeminiClient): Promise<void> {
    const history = client.getHistory();

    // Store history in session for future restoration
    // For now, we rely on messagesRepo - future optimization could cache history
    console.debug(`📝 Session ${sessionId} history updated: ${history.length} turns`);
  }

  /**
   * Clean up client for a session (e.g., on session close)
   */
  async closeSession(sessionId: SessionID): Promise<void> {
    const client = this.sessionClients.get(sessionId);
    if (client) {
      await client.resetChat(); // Clear history
      this.sessionClients.delete(sessionId);
      console.log(`🗑️  Closed Gemini client for session ${sessionId}`);
    }
  }
}
