import {
  BranchesOutlined,
  CloseOutlined,
  DragOutlined,
  EditOutlined,
  ExpandOutlined,
  ForkOutlined,
  LoadingOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons';
import { Badge, Button, Card, Collapse, Modal, Space, Spin, Tag, Typography } from 'antd';
import type { Session, Task } from '../../types';
import TaskListItem from '../TaskListItem';
import './SessionCard.css';

const { Text } = Typography;

const SESSION_CARD_MAX_WIDTH = 480;

interface SessionCardProps {
  session: Session;
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
  onSessionClick?: () => void;
  onDelete?: (sessionId: string) => void;
  defaultExpanded?: boolean;
}

const SessionCard = ({
  session,
  tasks,
  onTaskClick,
  onSessionClick,
  onDelete,
  defaultExpanded = true,
}: SessionCardProps) => {
  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Session',
      content: `Are you sure you want to delete this session "${session.description || session.session_id}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        onDelete?.(session.session_id);
      },
    });
  };
  const getAgentIcon = () => {
    const agentIcons: Record<string, string> = {
      'claude-code': '🤖',
      cursor: '✏️',
      codex: '💻',
      gemini: '💎',
    };
    return agentIcons[session.agent] || '🤖';
  };

  // Show last 5 tasks (oldest to newest)
  const visibleTasks = tasks.slice(-5);
  const hiddenTaskCount = tasks.length - visibleTasks.length;

  const isForked = !!session.genealogy.forked_from_session_id;
  const isSpawned = !!session.genealogy.parent_session_id;

  // Check if git state is dirty
  const isDirty = session.git_state.current_sha.endsWith('-dirty');
  const cleanSha = session.git_state.current_sha.replace('-dirty', '');

  // Task list collapse header (just the "Tasks" label)
  const taskListHeader = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
      }}
    >
      <Text strong>Tasks</Text>
      {tasks.length > 5 && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          (showing latest 5 of {tasks.length})
        </Text>
      )}
    </div>
  );

  // Task list content (collapsible)
  const taskListContent = (
    <div>
      {hiddenTaskCount > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Button
            type="text"
            icon={<PlusCircleOutlined />}
            size="small"
            onClick={e => {
              e.stopPropagation();
              onSessionClick?.();
            }}
          >
            See {hiddenTaskCount} more {hiddenTaskCount === 1 ? 'task' : 'tasks'}
          </Button>
        </div>
      )}

      {visibleTasks.map(task => (
        <TaskListItem key={task.task_id} task={task} onClick={() => onTaskClick?.(task.task_id)} />
      ))}
    </div>
  );

  return (
    <Card
      style={{ maxWidth: SESSION_CARD_MAX_WIDTH }}
      styles={{
        body: { padding: 16 },
      }}
    >
      {/* Session header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Space size={8} align="center" className="nodrag">
          <span style={{ fontSize: 20 }}>{getAgentIcon()}</span>
          <Text strong>{session.agent}</Text>
          {session.status === 'running' ? (
            <Spin indicator={<LoadingOutlined spin style={{ fontSize: 14 }} />} />
          ) : (
            <Badge
              status={
                session.status === 'completed'
                  ? 'success'
                  : session.status === 'failed'
                    ? 'error'
                    : 'default'
              }
              text={session.status.toUpperCase()}
            />
          )}
        </Space>

        <Space size={4}>
          <div className="nodrag">
            {isForked && (
              <Tag icon={<ForkOutlined />} color="cyan">
                FORK
              </Tag>
            )}
            {isSpawned && (
              <Tag icon={<BranchesOutlined />} color="purple">
                SPAWN
              </Tag>
            )}
          </div>
          <Button
            type="text"
            size="small"
            icon={<DragOutlined />}
            className="drag-handle"
            title="Drag to reposition"
            style={{ cursor: 'grab' }}
          />
          <div className="nodrag">
            {onSessionClick && (
              <Button
                type="text"
                size="small"
                icon={<ExpandOutlined />}
                onClick={e => {
                  e.stopPropagation();
                  onSessionClick();
                }}
                title="Open in drawer"
              />
            )}
            {onDelete && (
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={e => {
                  e.stopPropagation();
                  handleDelete();
                }}
                title="Delete session"
                danger
              />
            )}
          </div>
        </Space>
      </div>

      {/* Session metadata */}
      <div className="nodrag">
        {/* Description */}
        {session.description && (
          <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
            {session.description}
          </Text>
        )}

        {/* Git State */}
        <div style={{ marginBottom: 8 }}>
          <Space size={4}>
            <Text type="secondary">
              📍 {session.git_state.ref} @ {cleanSha.substring(0, 7)}
            </Text>
            {isDirty && (
              <Tag icon={<EditOutlined />} color="orange" style={{ fontSize: 11 }}>
                uncommitted
              </Tag>
            )}
          </Space>
        </div>

        {/* Concepts */}
        {session.concepts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Space size={4} wrap>
              <Text type="secondary">📦</Text>
              {session.concepts.map(concept => (
                <Tag key={concept} color="geekblue">
                  {concept}
                </Tag>
              ))}
            </Space>
          </div>
        )}
      </div>

      {/* Tasks - collapsible */}
      <div className="nodrag">
        <Collapse
          defaultActiveKey={defaultExpanded ? ['tasks'] : []}
          items={[
            {
              key: 'tasks',
              label: taskListHeader,
              children: taskListContent,
            },
          ]}
          ghost
          style={{ marginTop: 8 }}
        />

        {/* Footer metadata - always visible */}
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            💬 {session.message_count} messages
          </Text>
        </div>
      </div>
    </Card>
  );
};

export default SessionCard;
