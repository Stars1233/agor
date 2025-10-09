/**
 * ToolBlock Stories
 *
 * Demonstrates tool grouping with various scenarios:
 * - Multiple tool uses (Read, Edit, Bash, Grep)
 * - File operations summary
 * - Success and error states
 */

import type { Message, MessageID, SessionID, TaskID } from '@agor/core/types';
import type { Meta, StoryObj } from '@storybook/react';
import { ConfigProvider, theme } from 'antd';
import { ToolBlock } from './ToolBlock';

const meta: Meta<typeof ToolBlock> = {
  title: 'Components/ToolBlock',
  component: ToolBlock,
  decorators: [
    Story => (
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <div style={{ padding: '24px', background: '#141414', minHeight: '100vh' }}>
          <Story />
        </div>
      </ConfigProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ToolBlock>;

// Mock messages with tool uses
const mockToolMessages: Message[] = [
  {
    message_id: 'msg-001' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'assistant',
    role: 'assistant',
    index: 0,
    timestamp: new Date().toISOString(),
    content_preview: 'Read src/auth/jwt.ts',
    content: [
      {
        type: 'tool_use',
        id: 'tool-001',
        name: 'Read',
        input: {
          file_path: 'src/auth/jwt.ts',
        },
      },
    ],
    tool_uses: [
      {
        id: 'tool-001',
        name: 'Read',
        input: {
          file_path: 'src/auth/jwt.ts',
        },
      },
    ],
  },
  {
    message_id: 'msg-002' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'user',
    role: 'user',
    index: 1,
    timestamp: new Date().toISOString(),
    content_preview: 'Reading src/auth/jwt.ts...',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool-001',
        content:
          'export function generateToken(userId: string) {\n  return jwt.sign({ userId }, SECRET);\n}\n\nexport function verifyToken(token: string) {\n  return jwt.verify(token, SECRET);\n}',
        is_error: false,
      },
    ],
  },
  {
    message_id: 'msg-003' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'assistant',
    role: 'assistant',
    index: 2,
    timestamp: new Date().toISOString(),
    content_preview: 'Read src/auth/refresh.ts',
    content: [
      {
        type: 'tool_use',
        id: 'tool-002',
        name: 'Read',
        input: {
          file_path: 'src/auth/refresh.ts',
        },
      },
    ],
    tool_uses: [
      {
        id: 'tool-002',
        name: 'Read',
        input: {
          file_path: 'src/auth/refresh.ts',
        },
      },
    ],
  },
  {
    message_id: 'msg-004' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'user',
    role: 'user',
    index: 3,
    timestamp: new Date().toISOString(),
    content_preview: 'Reading refresh.ts',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool-002',
        content:
          'export function refreshToken(oldToken: string) {\n  const payload = verifyToken(oldToken);\n  return generateToken(payload.userId);\n}',
        is_error: false,
      },
    ],
  },
  {
    message_id: 'msg-005' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'assistant',
    role: 'assistant',
    index: 4,
    timestamp: new Date().toISOString(),
    content_preview: 'Edit src/auth/jwt.ts',
    content: [
      {
        type: 'tool_use',
        id: 'tool-003',
        name: 'Edit',
        input: {
          file_path: 'src/auth/jwt.ts',
          old_string: 'export function verifyToken(token: string) {',
          new_string: 'export async function verifyToken(token: string) {',
        },
      },
    ],
    tool_uses: [
      {
        id: 'tool-003',
        name: 'Edit',
        input: {
          file_path: 'src/auth/jwt.ts',
          old_string: 'export function verifyToken(token: string) {',
          new_string: 'export async function verifyToken(token: string) {',
        },
      },
    ],
  },
  {
    message_id: 'msg-006' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'user',
    role: 'user',
    index: 5,
    timestamp: new Date().toISOString(),
    content_preview: 'Edit successful',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool-003',
        content: 'Successfully edited src/auth/jwt.ts',
        is_error: false,
      },
    ],
  },
  {
    message_id: 'msg-007' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'assistant',
    role: 'assistant',
    index: 6,
    timestamp: new Date().toISOString(),
    content_preview: 'Edit src/auth/refresh.ts',
    content: [
      {
        type: 'tool_use',
        id: 'tool-004',
        name: 'Edit',
        input: {
          file_path: 'src/auth/refresh.ts',
          old_string: 'export function refreshToken',
          new_string: 'export async function refreshToken',
        },
      },
    ],
    tool_uses: [
      {
        id: 'tool-004',
        name: 'Edit',
        input: {
          file_path: 'src/auth/refresh.ts',
          old_string: 'export function refreshToken',
          new_string: 'export async function refreshToken',
        },
      },
    ],
  },
  {
    message_id: 'msg-008' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'user',
    role: 'user',
    index: 7,
    timestamp: new Date().toISOString(),
    content_preview: 'Edit successful',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool-004',
        content: 'Successfully edited src/auth/refresh.ts',
        is_error: false,
      },
    ],
  },
  {
    message_id: 'msg-009' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'assistant',
    role: 'assistant',
    index: 8,
    timestamp: new Date().toISOString(),
    content_preview: 'Bash: npm test',
    content: [
      {
        type: 'tool_use',
        id: 'tool-005',
        name: 'Bash',
        input: {
          command: 'npm test',
        },
      },
    ],
    tool_uses: [
      {
        id: 'tool-005',
        name: 'Bash',
        input: {
          command: 'npm test',
        },
      },
    ],
  },
  {
    message_id: 'msg-010' as MessageID,
    session_id: 'session-001' as SessionID,
    task_id: 'task-001' as TaskID,
    type: 'user',
    role: 'user',
    index: 9,
    timestamp: new Date().toISOString(),
    content_preview: 'Tests passed',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool-005',
        content:
          '✓ All tests passed (24 tests)\n  ✓ auth.test.ts (12 tests)\n  ✓ refresh.test.ts (12 tests)',
        is_error: false,
      },
    ],
  },
];

export const Default: Story = {
  args: {
    messages: mockToolMessages,
  },
};

export const WithErrors: Story = {
  args: {
    messages: [
      ...mockToolMessages.slice(0, 8),
      {
        message_id: 'msg-error' as MessageID,
        session_id: 'session-001' as SessionID,
        task_id: 'task-001' as TaskID,
        type: 'assistant',
        role: 'assistant',
        index: 8,
        timestamp: new Date().toISOString(),
        content_preview: 'Bash: npm test',
        content: [
          {
            type: 'tool_use',
            id: 'tool-error',
            name: 'Bash',
            input: {
              command: 'npm test',
            },
          },
        ],
        tool_uses: [
          {
            id: 'tool-error',
            name: 'Bash',
            input: {
              command: 'npm test',
            },
          },
        ],
      },
      {
        message_id: 'msg-error-result' as MessageID,
        session_id: 'session-001' as SessionID,
        task_id: 'task-001' as TaskID,
        type: 'user',
        role: 'user',
        index: 9,
        timestamp: new Date().toISOString(),
        content_preview: 'Test failed',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-error',
            content:
              '✗ 2 tests failed\n  ✗ auth.test.ts: "should refresh expired token"\n  ✗ auth.test.ts: "should reject invalid refresh"',
            is_error: true,
          },
        ],
      },
    ],
  },
};

export const ManyFiles: Story = {
  args: {
    messages: [
      ...Array.from({ length: 8 }, (_, i) => ({
        message_id: `msg-read-${i}` as MessageID,
        session_id: 'session-001' as SessionID,
        task_id: 'task-001' as TaskID,
        type: 'assistant' as const,
        role: 'assistant' as const,
        index: i * 2,
        timestamp: new Date().toISOString(),
        content_preview: `Read src/file-${i}.ts`,
        content: [
          {
            type: 'tool_use' as const,
            id: `tool-read-${i}`,
            name: 'Read',
            input: {
              file_path: `src/components/file-${i}.ts`,
            },
          },
        ],
        tool_uses: [
          {
            id: `tool-read-${i}`,
            name: 'Read',
            input: {
              file_path: `src/components/file-${i}.ts`,
            },
          },
        ],
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        message_id: `msg-result-${i}` as MessageID,
        session_id: 'session-001' as SessionID,
        task_id: 'task-001' as TaskID,
        type: 'user' as const,
        role: 'user' as const,
        index: i * 2 + 1,
        timestamp: new Date().toISOString(),
        content_preview: 'File contents...',
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: `tool-read-${i}`,
            content: `// File ${i} contents\nexport function foo() {}\n`,
            is_error: false,
          },
        ],
      })),
    ],
  },
};
