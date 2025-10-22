import { MessageOutlined, ToolOutlined } from '@ant-design/icons';
import { Button, Empty, List, Space, Tag, Typography } from 'antd';
import type { Session, Worktree } from '@agor/core/types';
import { TaskStatus } from '@agor/core/types';

const { Text } = Typography;

interface SessionsTabProps {
  worktree: Worktree;
  sessions: Session[];
}

export const SessionsTab: React.FC<SessionsTabProps> = ({ worktree, sessions }) => {
  const activeSessions = sessions.filter(s => s.status === TaskStatus.RUNNING);
  const completedSessions = sessions.filter(s => s.status === TaskStatus.COMPLETED);
  const failedSessions = sessions.filter(s => s.status === TaskStatus.FAILED);

  const getAgentIcon = (agenticTool: string) => {
    const agentIcons: Record<string, string> = {
      'claude-code': '🤖',
      cursor: '✏️',
      codex: '💻',
      gemini: '💎',
    };
    return agentIcons[agenticTool] || '🤖';
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'running':
        return <Tag color="processing">Running</Tag>;
      case 'completed':
        return <Tag color="success">Completed</Tag>;
      case 'failed':
        return <Tag color="error">Failed</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleViewSession = (sessionId: string) => {
    console.log('View session:', sessionId);
    // TODO: Open SessionDrawer or navigate to board
  };

  const handleOpenInBoard = (sessionId: string) => {
    console.log('Open in board:', sessionId);
    // TODO: Navigate to board and focus session
  };

  if (sessions.length === 0) {
    return (
      <div style={{ padding: '0 24px' }}>
        <Empty description="No sessions have used this worktree yet" />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: '0 24px' }}>
      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div>
          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
            Active Sessions ({activeSessions.length})
          </Text>
          <List
            size="small"
            bordered
            dataSource={activeSessions}
            renderItem={session => (
              <List.Item
                actions={[
                  <Button
                    key="view"
                    type="link"
                    size="small"
                    onClick={() => handleViewSession(session.session_id)}
                  >
                    View Session
                  </Button>,
                  <Button
                    key="board"
                    type="link"
                    size="small"
                    onClick={() => handleOpenInBoard(session.session_id)}
                  >
                    Open in Board
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <span style={{ fontSize: 20 }}>{getAgentIcon(session.agentic_tool)}</span>
                  }
                  title={
                    <Space>
                      <Text code style={{ fontSize: 11 }}>
                        {session.session_id.substring(0, 8)}
                      </Text>
                      <Text strong style={{ fontSize: 12, textTransform: 'capitalize' }}>
                        {session.agentic_tool}
                      </Text>
                      {getStatusTag(session.status)}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      {(session.title || session.description) && (
                        <Text style={{ fontSize: 12 }}>{session.title || session.description}</Text>
                      )}
                      <Space size="small" style={{ fontSize: 11 }}>
                        <Text type="secondary">Created: {formatTimeAgo(session.created_at)}</Text>
                        <Text type="secondary">
                          <MessageOutlined /> {session.message_count}
                        </Text>
                        <Text type="secondary">
                          <ToolOutlined /> {session.tool_use_count}
                        </Text>
                      </Space>
                      {session.tasks && session.tasks.length > 0 && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          📋 {session.tasks.length} task(s)
                        </Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Completed Sessions */}
      {completedSessions.length > 0 && (
        <div>
          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
            Completed Sessions ({completedSessions.length})
          </Text>
          <List
            size="small"
            bordered
            dataSource={completedSessions.slice(0, 10)} // Show only first 10
            renderItem={session => (
              <List.Item
                actions={[
                  <Button
                    key="view"
                    type="link"
                    size="small"
                    onClick={() => handleViewSession(session.session_id)}
                  >
                    View Session
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <span style={{ fontSize: 20 }}>{getAgentIcon(session.agentic_tool)}</span>
                  }
                  title={
                    <Space>
                      <Text code style={{ fontSize: 11 }}>
                        {session.session_id.substring(0, 8)}
                      </Text>
                      <Text strong style={{ fontSize: 12, textTransform: 'capitalize' }}>
                        {session.agentic_tool}
                      </Text>
                      {getStatusTag(session.status)}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      {(session.title || session.description) && (
                        <Text style={{ fontSize: 12 }}>{session.title || session.description}</Text>
                      )}
                      <Space size="small" style={{ fontSize: 11 }}>
                        <Text type="secondary">
                          Completed: {formatTimeAgo(session.last_updated)}
                        </Text>
                        <Text type="secondary">
                          <MessageOutlined /> {session.message_count}
                        </Text>
                        <Text type="secondary">
                          <ToolOutlined /> {session.tool_use_count}
                        </Text>
                      </Space>
                      {session.tasks && session.tasks.length > 0 && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          📋 {session.tasks.length} task(s)
                        </Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
          {completedSessions.length > 10 && (
            <Button type="link" size="small" style={{ marginTop: 8 }}>
              Show all {completedSessions.length} completed sessions
            </Button>
          )}
        </div>
      )}

      {/* Failed Sessions */}
      {failedSessions.length > 0 && (
        <div>
          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
            Failed Sessions ({failedSessions.length})
          </Text>
          <List
            size="small"
            bordered
            dataSource={failedSessions}
            renderItem={session => (
              <List.Item
                actions={[
                  <Button
                    key="view"
                    type="link"
                    size="small"
                    onClick={() => handleViewSession(session.session_id)}
                  >
                    View Session
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <span style={{ fontSize: 20 }}>{getAgentIcon(session.agentic_tool)}</span>
                  }
                  title={
                    <Space>
                      <Text code style={{ fontSize: 11 }}>
                        {session.session_id.substring(0, 8)}
                      </Text>
                      <Text strong style={{ fontSize: 12, textTransform: 'capitalize' }}>
                        {session.agentic_tool}
                      </Text>
                      {getStatusTag(session.status)}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      {(session.title || session.description) && (
                        <Text style={{ fontSize: 12 }}>{session.title || session.description}</Text>
                      )}
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Failed: {formatTimeAgo(session.last_updated)}
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}
    </Space>
  );
};
