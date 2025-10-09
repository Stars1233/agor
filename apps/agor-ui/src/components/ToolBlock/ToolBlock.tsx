/**
 * ToolBlock - Groups sequential tool uses into a collapsible summary
 *
 * When 3+ tool uses appear consecutively (no text messages between them),
 * this component groups them into a collapsed summary showing:
 * - Total tool count with grouped counts by tool type
 * - Visual tags with tool icons and × counts
 * - Smart summaries (files modified, searches, etc.)
 * - Expandable to show full tool details
 *
 * This is the "new visual grammar" that sets Agor apart from terminals.
 * Based on design in context/explorations/conversation-design.md
 */

import type { Message } from '@agor/core/types';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  FileTextOutlined,
  RightOutlined,
  SearchOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Collapse, Space, Tag, Typography } from 'antd';
import type React from 'react';
import { useMemo } from 'react';
import { ToolIcon } from '../ToolIcon';
import { ToolUseRenderer } from '../ToolUseRenderer';
import './ToolBlock.css';

const { Text } = Typography;

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

interface TextBlock {
  type: 'text';
  text: string;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

interface ToolBlockProps {
  /**
   * Messages containing tool uses (should be tool-only messages)
   */
  messages: Message[];
}

interface ToolInvocation {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
  message: Message;
}

export const ToolBlock: React.FC<ToolBlockProps> = ({ messages }) => {
  // Extract all tool invocations from messages
  const toolInvocations = useMemo(() => {
    const invocations: ToolInvocation[] = [];

    for (const message of messages) {
      if (typeof message.content === 'string') continue;
      if (!Array.isArray(message.content)) continue;

      const toolUseMap = new Map<string, ToolUseBlock>();
      const toolResultMap = new Map<string, ToolResultBlock>();

      // First pass: collect tool_use and tool_result blocks
      for (const block of message.content) {
        if (block.type === 'tool_use') {
          const toolUse = block as ToolUseBlock;
          toolUseMap.set(toolUse.id, toolUse);
        } else if (block.type === 'tool_result') {
          const toolResult = block as ToolResultBlock;
          toolResultMap.set(toolResult.tool_use_id, toolResult);
        }
      }

      // Second pass: match tool_use with tool_result
      for (const [id, toolUse] of toolUseMap.entries()) {
        invocations.push({
          toolUse,
          toolResult: toolResultMap.get(id),
          message,
        });
      }
    }

    return invocations;
  }, [messages]);

  // Group tools by name and count
  const toolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const invocation of toolInvocations) {
      const name = invocation.toolUse.name;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }, [toolInvocations]);

  // Extract unique files affected (for Edit/Read/Write tools)
  const filesAffected = useMemo(() => {
    const files = new Set<string>();
    for (const invocation of toolInvocations) {
      const { name, input } = invocation.toolUse;
      if (['Edit', 'Read', 'Write'].includes(name) && input.file_path) {
        files.add(input.file_path as string);
      }
    }
    return Array.from(files).sort();
  }, [toolInvocations]);

  // Count success/error results
  const resultStats = useMemo(() => {
    let successes = 0;
    let errors = 0;
    for (const invocation of toolInvocations) {
      if (invocation.toolResult) {
        if (invocation.toolResult.is_error) {
          errors++;
        } else {
          successes++;
        }
      }
    }
    return { successes, errors };
  }, [toolInvocations]);

  const totalTools = toolInvocations.length;

  // Collapsed summary header
  const summaryHeader = (
    <div className="tool-block-header">
      <Space size={12} align="start" style={{ width: '100%', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ToolOutlined style={{ fontSize: 16 }} />
          <Text strong>{totalTools} tools executed</Text>
        </div>

        {/* Tool type tags */}
        <Space size={8} wrap>
          {Array.from(toolCounts.entries()).map(([name, count]) => (
            <Tag
              key={name}
              icon={<ToolIcon tool={name} size={12} />}
              style={{ fontSize: 11, margin: 0 }}
            >
              {name} × {count}
            </Tag>
          ))}
        </Space>

        {/* Result stats */}
        <Space size={8}>
          {resultStats.successes > 0 && (
            <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 11, margin: 0 }}>
              {resultStats.successes} success
            </Tag>
          )}
          {resultStats.errors > 0 && (
            <Tag icon={<CloseCircleOutlined />} color="error" style={{ fontSize: 11, margin: 0 }}>
              {resultStats.errors} error
            </Tag>
          )}
        </Space>
      </Space>

      {/* Files affected summary */}
      {filesAffected.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FileTextOutlined /> Modified files ({filesAffected.length}):
            </Text>
            <div style={{ paddingLeft: 16 }}>
              {filesAffected.slice(0, 5).map(file => (
                <div key={file}>
                  <Text code style={{ fontSize: 11 }}>
                    {file}
                  </Text>
                </div>
              ))}
              {filesAffected.length > 5 && (
                <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>
                  ... and {filesAffected.length - 5} more
                </Text>
              )}
            </div>
          </Space>
        </div>
      )}
    </div>
  );

  return (
    <div className="tool-block">
      <Collapse
        defaultActiveKey={[]}
        expandIcon={({ isActive }) => (isActive ? <DownOutlined /> : <RightOutlined />)}
        items={[
          {
            key: 'tool-details',
            label: summaryHeader,
            children: (
              <div className="tool-block-details">
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  {toolInvocations.map(({ toolUse, toolResult }, index) => (
                    <div key={toolUse.id || index} className="tool-block-item">
                      <ToolUseRenderer toolUse={toolUse} toolResult={toolResult} />
                    </div>
                  ))}
                </Space>
              </div>
            ),
          },
        ]}
        className="tool-block-collapse"
      />
    </div>
  );
};
