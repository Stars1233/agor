/**
 * TaskBlock - Collapsible task section containing messages
 *
 * Features:
 * - Collapsed: Shows task summary with metadata
 * - Expanded: Shows all messages in the task
 * - Default: Latest task expanded, older collapsed
 * - Progressive disclosure pattern
 * - Groups 3+ sequential tool-only messages into ToolBlock
 */

import type { Message, Task } from '@agor/core/types';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  FileTextOutlined,
  GithubOutlined,
  MessageOutlined,
  RightOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Collapse, Space, Tag, Typography } from 'antd';
import type React from 'react';
import { useMemo } from 'react';
import { MessageBlock } from '../MessageBlock';
import { ToolBlock } from '../ToolBlock';
import './TaskBlock.css';

const { Text, Paragraph } = Typography;

/**
 * Block types for rendering
 */
type Block = { type: 'message'; message: Message } | { type: 'tool-block'; messages: Message[] };

interface TaskBlockProps {
  task: Task;
  messages: Message[];
  defaultExpanded?: boolean;
}

/**
 * Check if message is tool-only (no text content, only tool uses)
 */
function isToolOnlyMessage(message: Message): boolean {
  if (typeof message.content === 'string') {
    return message.content.trim().length === 0 && message.tool_uses && message.tool_uses.length > 0;
  }

  if (Array.isArray(message.content)) {
    const hasText = message.content.some(block => block.type === 'text');
    const hasTools = message.content.some(block => block.type === 'tool_use');
    return !hasText && hasTools;
  }

  return false;
}

/**
 * Group messages into blocks:
 * - When 3+ consecutive tool-only messages appear → group into ToolBlock
 * - Otherwise → render as individual MessageBlock
 */
function groupMessagesIntoBlocks(messages: Message[]): Block[] {
  const blocks: Block[] = [];
  let toolBuffer: Message[] = [];

  for (const msg of messages) {
    if (isToolOnlyMessage(msg)) {
      // Accumulate tool-only messages
      toolBuffer.push(msg);
    } else {
      // Flush tool buffer if we have 3+ tools
      if (toolBuffer.length >= 3) {
        blocks.push({ type: 'tool-block', messages: toolBuffer });
        toolBuffer = [];
      } else if (toolBuffer.length > 0) {
        // Too few to group - render individually
        blocks.push(...toolBuffer.map(m => ({ type: 'message' as const, message: m })));
        toolBuffer = [];
      }

      // Add the current message
      blocks.push({ type: 'message', message: msg });
    }
  }

  // Flush remaining buffer
  if (toolBuffer.length >= 3) {
    blocks.push({ type: 'tool-block', messages: toolBuffer });
  } else if (toolBuffer.length > 0) {
    blocks.push(...toolBuffer.map(m => ({ type: 'message' as const, message: m })));
  }

  return blocks;
}

export const TaskBlock: React.FC<TaskBlockProps> = ({
  task,
  messages,
  defaultExpanded = false,
}) => {
  // Group messages into blocks
  const blocks = useMemo(() => groupMessagesIntoBlocks(messages), [messages]);

  const getStatusIcon = () => {
    switch (task.status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'running':
        return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case 'completed':
        return 'success';
      case 'running':
        return 'processing';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  // Task header shows when collapsed
  const taskHeader = (
    <div className="task-header">
      <Space size={8} align="start" style={{ width: '100%' }}>
        <div className="task-status-icon">{getStatusIcon()}</div>
        <div className="task-header-content">
          <div className="task-description">
            <Text strong>{task.description || 'User Prompt'}</Text>
            <Tag color={getStatusColor()} style={{ marginLeft: 8, fontSize: 11 }}>
              {task.status.toUpperCase()}
            </Tag>
          </div>

          {/* Task metadata */}
          <Space size={12} style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <MessageOutlined /> {messages.length}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ToolOutlined /> {task.tool_use_count}
            </Text>
            {task.model && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                🤖 {task.model}
              </Text>
            )}
            {task.git_state.sha_at_end && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                <GithubOutlined /> {task.git_state.sha_at_end.substring(0, 7)}
              </Text>
            )}
            {task.report && (
              <Tag icon={<FileTextOutlined />} color="green" style={{ fontSize: 11 }}>
                Report
              </Tag>
            )}
          </Space>

          {/* Show preview of full prompt when collapsed */}
          {task.full_prompt && (
            <Paragraph
              ellipsis={{ rows: 2 }}
              type="secondary"
              style={{
                marginTop: 8,
                marginBottom: 0,
                fontSize: 12,
                fontFamily: 'monospace',
                background: 'rgba(0, 0, 0, 0.02)',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              {task.full_prompt}
            </Paragraph>
          )}
        </div>
      </Space>
    </div>
  );

  return (
    <div className="task-block">
      <Collapse
        defaultActiveKey={defaultExpanded ? ['task-content'] : []}
        expandIcon={({ isActive }) => (isActive ? <DownOutlined /> : <RightOutlined />)}
        items={[
          {
            key: 'task-content',
            label: taskHeader,
            children: (
              <div className="task-messages">
                {blocks.length === 0 ? (
                  <Text type="secondary" style={{ fontStyle: 'italic' }}>
                    No messages in this task
                  </Text>
                ) : (
                  blocks.map(block => {
                    if (block.type === 'message') {
                      return (
                        <MessageBlock key={block.message.message_id} message={block.message} />
                      );
                    }
                    if (block.type === 'tool-block') {
                      // Use first message ID as key for tool block
                      const blockKey = `tool-block-${block.messages[0]?.message_id || 'unknown'}`;
                      return <ToolBlock key={blockKey} messages={block.messages} />;
                    }
                    return null;
                  })
                )}

                {/* Show commit message if available */}
                {task.git_state.commit_message && (
                  <div className="task-commit-message">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <GithubOutlined /> Commit:{' '}
                    </Text>
                    <Text code style={{ fontSize: 11 }}>
                      {task.git_state.commit_message}
                    </Text>
                  </div>
                )}

                {/* Show report if available */}
                {task.report && (
                  <div className="task-report">
                    <Tag icon={<FileTextOutlined />} color="green">
                      Task Report
                    </Tag>
                    <Paragraph
                      style={{
                        marginTop: 8,
                        padding: 12,
                        background: 'rgba(82, 196, 26, 0.05)',
                        border: '1px solid var(--ant-color-success-border)',
                        borderRadius: 4,
                        fontSize: 13,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {task.report}
                    </Paragraph>
                  </div>
                )}
              </div>
            ),
          },
        ]}
        className="task-collapse"
      />
    </div>
  );
};
