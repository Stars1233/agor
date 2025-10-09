/**
 * ConversationView - Task-centric conversation interface
 *
 * Displays conversation as collapsible task sections with:
 * - Tasks as primary organization unit
 * - Messages grouped within each task
 * - Tool use blocks properly rendered
 * - Latest task expanded by default
 * - Progressive disclosure for older tasks
 * - Auto-scrolling to latest content
 *
 * Based on design in context/explorations/conversation-design.md
 */

import type { AgorClient } from '@agor/core/api';
import type { Message, SessionID, Task } from '@agor/core/types';
import { Alert, Empty, Spin, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMessages, useTasks } from '../../hooks';
import { MessageBlock } from '../MessageBlock';
import { TaskBlock } from '../TaskBlock';

const { Text } = Typography;

export interface ConversationViewProps {
  /**
   * Agor client for fetching messages
   */
  client: AgorClient | null;

  /**
   * Session ID to fetch messages for
   */
  sessionId: SessionID | null;

  /**
   * Callback to expose scroll-to-bottom function to parent
   */
  onScrollRef?: (scrollToBottom: () => void) => void;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  client,
  sessionId,
  onScrollRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom function (wrapped in useCallback to avoid re-renders)
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  // Expose scroll function to parent
  useEffect(() => {
    if (onScrollRef) {
      onScrollRef(scrollToBottom);
    }
  }, [onScrollRef, scrollToBottom]);

  // Fetch messages and tasks for this session
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
  } = useMessages(client, sessionId);
  const { tasks, loading: tasksLoading, error: tasksError } = useTasks(client, sessionId);

  const loading = messagesLoading || tasksLoading;
  const error = messagesError || tasksError;

  // Group messages by task
  const taskWithMessages = useMemo(() => {
    if (tasks.length === 0) return [];

    return tasks.map(task => ({
      task,
      messages: messages.filter(msg => msg.task_id === task.task_id),
    }));
  }, [tasks, messages]);

  // Find orphaned messages (messages without a task_id)
  const orphanedMessages = useMemo(() => {
    return messages.filter(msg => !msg.task_id);
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to scroll on messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, tasks]);

  if (error) {
    return (
      <Alert type="error" message="Failed to load conversation" description={error} showIcon />
    );
  }

  if (loading && messages.length === 0 && tasks.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <Spin tip="Loading conversation..." />
      </div>
    );
  }

  if (messages.length === 0 && tasks.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          padding: '2rem',
        }}
      >
        <Empty description="No conversation yet" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '16px',
      }}
    >
      {/* Orphaned messages (messages without task_id) */}
      {orphanedMessages.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
            Messages without associated tasks:
          </Text>
          {orphanedMessages.map(message => (
            <MessageBlock key={message.message_id} message={message} />
          ))}
        </div>
      )}

      {/* Task-organized conversation */}
      {taskWithMessages.map(({ task, messages: taskMessages }, index) => (
        <TaskBlock
          key={task.task_id}
          task={task}
          messages={taskMessages}
          // Expand only the last task by default
          defaultExpanded={index === taskWithMessages.length - 1}
        />
      ))}
    </div>
  );
};
