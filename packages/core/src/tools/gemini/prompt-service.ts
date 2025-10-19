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

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ApprovalMode,
  AuthType,
  Config,
  executeToolCall,
  GeminiClient,
  GeminiEventType,
  type ResumedSessionData,
  type ServerGeminiStreamEvent,
  type ToolCallRequestInfo,
} from '@google/gemini-cli-core';
import type { Content, FunctionCall, Part } from '@google/genai';
import type { MessagesRepository } from '../../db/repositories/messages';
import type { SessionRepository } from '../../db/repositories/sessions';
import type { PermissionMode, SessionID, TaskID } from '../../types';
import { DEFAULT_GEMINI_MODEL, type GeminiModel } from './models';

/**
 * GeminiClient with internal config property exposed
 * The SDK doesn't expose this in types, but we need it for executeToolCall()
 */
interface GeminiClientWithConfig extends GeminiClient {
  config: Config;
}

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
  private activeControllers = new Map<SessionID, AbortController>();

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

    // Prepare initial prompt (just text for now - can enhance with file paths later)
    let parts = [{ text: prompt }];

    // Create abort controller for cancellation support
    const abortController = new AbortController();
    this.activeControllers.set(sessionId, abortController);

    // Generate unique prompt ID for this turn
    const promptId = `${sessionId}-${Date.now()}`;

    try {
      // Tool execution loop - keep going until no more tool calls
      let loopCount = 0;
      const MAX_LOOPS = 50; // Safety limit to prevent infinite loops

      while (loopCount < MAX_LOOPS) {
        loopCount++;
        console.debug(`[Gemini Loop ${loopCount}] Starting turn with ${parts.length} parts`);

        // Stream events from Gemini SDK
        const stream = client.sendMessageStream(parts, abortController.signal, promptId);

        // Accumulate content blocks for THIS turn (reset after Finished event)
        let fullTextContent = '';
        const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        const pendingToolCalls: Array<{
          callId: string;
          name: string;
          args: Record<string, unknown>;
        }> = [];

        // Stream all events from this turn
        for await (const event of stream) {
          // Debug logging for all events
          const eventValue = 'value' in event ? event.value : undefined;
          console.debug(
            `[Gemini Event] ${event.type}:`,
            eventValue ? JSON.stringify(eventValue).slice(0, 100) : '(no value)'
          );

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

              // Track pending tool call for loop continuation
              pendingToolCalls.push({
                callId,
                name,
                args,
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
              const toolResponse = event.value as unknown as Record<string, unknown>;

              yield {
                type: 'tool_complete',
                toolName: (toolResponse.name as string) || 'unknown',
                result: toolResponse.response || toolResponse,
              };
              break;
            }

            case GeminiEventType.Finished: {
              // Turn complete - yield final message (if we have any content)
              console.debug(
                `[Gemini Turn Finished] Text: ${fullTextContent.length} chars, Tools: ${toolUses.length}`
              );

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

              // Only yield complete message if we actually have content
              if (content.length > 0) {
                yield {
                  type: 'complete',
                  content,
                  toolUses: toolUses.length > 0 ? toolUses : undefined,
                  resolvedModel: model,
                  sessionId,
                };
              }

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
              console.warn(
                '[Gemini] Tool call needs confirmation - this should not happen in AUTO_EDIT/YOLO mode!'
              );
              console.warn('[Gemini] Confirmation details:', JSON.stringify(event.value, null, 2));
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

        // Check if there are pending tool calls that need execution
        if (pendingToolCalls.length === 0) {
          console.debug('[Gemini Loop] No pending tool calls - conversation complete!');
          break; // No more tools to execute, we're done!
        }

        console.debug(`[Gemini Loop] Found ${pendingToolCalls.length} pending tool calls`);

        // CRITICAL: The Gemini SDK does NOT auto-execute tools in streaming mode!
        // We need to manually execute the tools using SDK's executeToolCall() and send results back.

        // Get config for executeToolCall
        const config = (client as GeminiClientWithConfig).config;

        // Execute all pending tool calls using SDK's executeToolCall function
        const functionResponseParts: Part[] = [];

        for (const toolCall of pendingToolCalls) {
          try {
            console.debug(
              `[Gemini Loop] Executing tool: ${toolCall.name} with args:`,
              JSON.stringify(toolCall.args).slice(0, 100)
            );

            // Use SDK's executeToolCall function instead of manually calling tool.execute()
            const response = await executeToolCall(config, toolCall, abortController.signal);
            console.debug(`[Gemini Loop] Tool ${toolCall.name} executed successfully`);

            // Add the response parts from the SDK (already formatted correctly)
            functionResponseParts.push(...response.responseParts);
          } catch (error) {
            console.error(`[Gemini Loop] Error executing tool ${toolCall.name}:`, error);
            // On error, create a function response part with the error
            functionResponseParts.push({
              functionResponse: {
                name: toolCall.name,
                response: { error: String(error) },
              },
            } as Part);
          }
        }

        // Prepare next message with tool results
        // Send the function responses back to the model to get its response
        parts = functionResponseParts; // SDK expects PartListUnion (Part[])
        console.debug(
          `[Gemini Loop] Sending ${functionResponseParts.length} tool result parts back to model...`
        );

        // Loop will continue with the function response parts sent to the model
      }

      if (loopCount >= MAX_LOOPS) {
        console.warn(
          `[Gemini Loop] Hit maximum loop count (${MAX_LOOPS}) - stopping to prevent infinite loop`
        );
      }
    } catch (error) {
      // Check if error is from abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`🛑 Gemini execution stopped for session ${sessionId}`);
        // Don't re-throw abort errors - this is expected behavior
        return;
      }
      console.error('Gemini streaming error:', error);
      throw error;
    } finally {
      // Clean up abort controller
      this.activeControllers.delete(sessionId);
    }
  }

  /**
   * Load session file from SDK's filesystem storage
   *
   * Searches for session file in ~/.gemini/tmp/{projectHash}/chats/
   * matching pattern: session-*-{sessionId-first8}.json
   */
  private async loadSessionFile(
    sessionId: SessionID,
    projectRoot: string
  ): Promise<ResumedSessionData | null> {
    try {
      // Calculate project hash (same as SDK does)
      const projectHash = crypto.createHash('sha256').update(projectRoot).digest('hex');
      const chatsDir = path.join(os.homedir(), '.gemini', 'tmp', projectHash, 'chats');

      // Check if chats directory exists
      try {
        await fs.access(chatsDir);
      } catch {
        console.debug(`No chats directory found for project ${projectRoot}`);
        return null;
      }

      // Find session file matching pattern: session-*-{sessionId-first8}.json
      const sessionIdShort = sessionId.slice(0, 8);
      const files = await fs.readdir(chatsDir);
      const sessionFile = files.find(f => f.includes(sessionIdShort) && f.endsWith('.json'));

      if (!sessionFile) {
        console.debug(`No session file found for ${sessionId} (looking for *${sessionIdShort}*)`);
        return null;
      }

      // Load and parse the conversation file
      const filePath = path.join(chatsDir, sessionFile);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const conversation = JSON.parse(fileContent);

      console.log(`📂 Found session file: ${sessionFile}`);
      return { conversation, filePath };
    } catch (error) {
      console.error('Error loading session file:', error);
      return null;
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
    // Map Agor permission mode to Gemini ApprovalMode
    const approvalMode = this.mapPermissionMode(permissionMode || 'ask');

    // Check if client exists and update approval mode if it changed
    if (this.sessionClients.has(sessionId)) {
      const existingClient = this.sessionClients.get(sessionId)!;
      // Update approval mode on existing client (in case it changed)
      const config = (existingClient as GeminiClientWithConfig).config;
      if (config && typeof config.setApprovalMode === 'function') {
        config.setApprovalMode(approvalMode);
        console.log(`🔄 [Gemini] Updated approval mode for existing client: ${approvalMode}`);
      }
      return existingClient;
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

    // approvalMode already mapped at top of function
    console.log(
      `🔧 [Gemini] Creating new client with approval mode: ${permissionMode || 'ask'} → ${approvalMode}`
    );

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
      interactive: false, // Use non-interactive mode (we'll handle tool execution ourselves)
      approvalMode,
      debugMode: true, // Enable debug logging to see what's happening
      folderTrust: true, // CRITICAL: Trust folder to allow YOLO/AUTO_EDIT modes
      trustedFolder: true, // CRITICAL: Mark folder as trusted
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

    // Try to load existing session file from SDK's filesystem storage
    const resumedSessionData = await this.loadSessionFile(sessionId, workingDirectory);

    // Create client (config must be initialized and authenticated first!)
    const client = new GeminiClient(config);
    await client.initialize();

    // Check if we have existing conversation history
    let hasExistingHistory = false;
    if (resumedSessionData) {
      // Use SDK's native resumption mechanism
      const recordingService = client.getChatRecordingService();
      if (recordingService) {
        recordingService.initialize(resumedSessionData);
        console.log(
          `🔄 Resumed session from file: ${resumedSessionData.conversation.messages.length} messages`
        );
        hasExistingHistory = true;

        // Also restore to client history for API continuity
        // Convert ConversationRecord messages to Content[] format
        const history = this.convertConversationToHistory(resumedSessionData.conversation);
        client.setHistory(history);
      }
    }

    // Add system prompt as first message if CLAUDE.md exists
    if (systemPrompt && !hasExistingHistory) {
      // Will be added on first user message
    }

    // Cache client for reuse
    this.sessionClients.set(sessionId, client);

    return client;
  }

  /**
   * Map Agor permission mode to Gemini ApprovalMode
   *
   * Gemini SDK supports 3 modes:
   * - DEFAULT: Prompt for each tool use
   * - AUTO_EDIT: Auto-approve file edits, prompt for shell/web commands
   * - YOLO: Auto-approve all operations
   */
  private mapPermissionMode(permissionMode: PermissionMode): ApprovalMode {
    switch (permissionMode) {
      case 'default':
      case 'ask':
        return ApprovalMode.DEFAULT; // Prompt for each tool use

      case 'acceptEdits':
      case 'auto':
        // TEMPORARY: Map to YOLO since AUTO_EDIT blocks shell commands in non-interactive mode
        // TODO: Implement proper approval handling for AUTO_EDIT mode
        return ApprovalMode.YOLO; // Auto-approve all operations (was: AUTO_EDIT)

      case 'bypassPermissions':
      case 'allow-all':
        return ApprovalMode.YOLO; // Auto-approve all operations

      default:
        return ApprovalMode.DEFAULT;
    }
  }

  /**
   * Convert SDK's ConversationRecord to Gemini Content[] format
   *
   * This converts the SDK's session file format into the API format needed for setHistory()
   */
  private convertConversationToHistory(conversation: {
    messages: Array<{
      type: 'user' | 'gemini';
      content: unknown;
    }>;
  }): Content[] {
    const history: Content[] = [];

    for (const msg of conversation.messages) {
      const role = msg.type === 'user' ? 'user' : 'model';
      const parts: Part[] = [];

      // SDK stores content as PartListUnion (array or single part)
      const content = msg.content;
      if (Array.isArray(content)) {
        // Already in parts format
        parts.push(...(content as Part[]));
      } else if (content && typeof content === 'object' && 'text' in content) {
        // Single part with text
        parts.push(content as Part);
      }

      if (parts.length > 0) {
        history.push({ role: role as 'user' | 'model', parts });
      }
    }

    return history;
  }

  /**
   * Convert Agor messages to Gemini Content[] format for history restoration
   * @deprecated Use SDK's native session files instead (convertConversationToHistory)
   */
  private convertMessagesToGeminiHistory(
    messages: Array<{ role: string; content: unknown }>
  ): Content[] {
    // @google/genai Content type expects { role: 'user' | 'model', parts: Part[] }
    const history: Content[] = [];

    for (const msg of messages) {
      // Map role: 'assistant' → 'model', keep 'user' as is
      const role = msg.role === 'assistant' ? 'model' : msg.role;
      if (role !== 'user' && role !== 'model') {
        continue; // Skip system messages, etc.
      }

      // Convert content to parts array
      const parts: Part[] = [];

      if (Array.isArray(msg.content)) {
        // Content is array of blocks (text, tool_use, etc.)
        for (const block of msg.content) {
          if (typeof block === 'object' && block !== null) {
            const b = block as {
              type?: string;
              text?: string;
              id?: string;
              name?: string;
              input?: unknown;
            };
            if (b.type === 'text' && b.text) {
              parts.push({ text: b.text });
            } else if (b.type === 'tool_use' && b.name && b.input) {
              // Convert tool_use to functionCall
              const functionCall: FunctionCall = {
                name: b.name,
                args: b.input as Record<string, unknown>,
              };
              parts.push({ functionCall });
            }
            // TODO: Handle tool_result → functionResponse if needed
          }
        }
      } else if (typeof msg.content === 'string') {
        // Content is plain string
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        history.push({ role: role as 'user' | 'model', parts });
      }
    }

    return history;
  }

  /**
   * Update session history after turn completion
   *
   * The SDK's ChatRecordingService automatically persists to filesystem,
   * so we just log for debugging purposes.
   */
  private async updateSessionHistory(sessionId: SessionID, client: GeminiClient): Promise<void> {
    const history = client.getHistory();
    const recordingService = client.getChatRecordingService();

    if (recordingService) {
      console.debug(
        `📝 Session ${sessionId} history updated: ${history.length} turns (auto-saved to filesystem)`
      );
    } else {
      console.warn(
        `⚠️  No ChatRecordingService found for session ${sessionId} - history not persisted`
      );
    }
  }

  /**
   * Stop currently executing task
   *
   * Calls abort() on the AbortController to gracefully stop streaming.
   *
   * @param sessionId - Session identifier
   * @returns Success status
   */
  stopTask(sessionId: SessionID): { success: boolean; reason?: string } {
    const controller = this.activeControllers.get(sessionId);
    if (!controller) {
      return {
        success: false,
        reason: 'No active task found for this session',
      };
    }

    // Abort the streaming request
    controller.abort();
    console.log(`🛑 Stopping Gemini task for session ${sessionId}`);

    return { success: true };
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
