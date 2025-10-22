import {
  BranchesOutlined,
  CloseOutlined,
  DragOutlined,
  EditOutlined,
  ExpandOutlined,
  ForkOutlined,
  LoadingOutlined,
  PlusCircleOutlined,
  PushpinFilled,
  SettingOutlined,
} from '@ant-design/icons';
import { App, Badge, Button, Card, Collapse, Space, Spin, Tag, Typography } from 'antd';
import type { Session, Task, User } from '@agor/core/types';
import { TaskStatus } from '@agor/core/types';
import { CreatedByTag } from '../metadata';
import TaskListItem from '../TaskListItem';
import { ToolIcon } from '../ToolIcon';

const { Text } = Typography;

const SESSION_CARD_MAX_WIDTH = 560;

interface SessionCardProps {
  session: Session;
  tasks: Task[];
  users: User[];
  currentUserId?: string;
  onTaskClick?: (taskId: string) => void;
  onSessionClick?: () => void;
  onDelete?: (sessionId: string) => void;
  onOpenSettings?: (sessionId: string) => void;
  onUnpin?: (sessionId: string) => void;
  isPinned?: boolean;
  zoneName?: string;
  zoneColor?: string;
  defaultExpanded?: boolean;
}

const SessionCard = ({
  session,
  tasks,
  users,
  currentUserId,
  onTaskClick,
  onSessionClick,
  onDelete,
  onOpenSettings,
  onUnpin,
  isPinned = false,
  zoneName,
  zoneColor,
  defaultExpanded = true,
}: SessionCardProps) => {
  const { modal } = App.useApp();

  const handleDelete = () => {
    modal.confirm({
      title: 'Delete Session',
      content: 'Are you sure you want to delete this session? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        onDelete?.(session.session_id);
      },
    });
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
      style={{
        maxWidth: SESSION_CARD_MAX_WIDTH,
        ...(isPinned && zoneColor ? { borderColor: zoneColor, borderWidth: 1 } : {}),
      }}
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
        <Space size={8} align="center">
          <div className="drag-handle" style={{ display: 'flex', alignItems: 'center' }}>
            <ToolIcon tool={session.agentic_tool} size={32} />
          </div>
          <Text strong className="nodrag">
            {session.agentic_tool}
          </Text>
          {session.status === TaskStatus.RUNNING ? (
            <Spin indicator={<LoadingOutlined spin style={{ fontSize: 14 }} />} />
          ) : (
            <Badge
              status={
                session.status === TaskStatus.COMPLETED
                  ? 'success'
                  : session.status === TaskStatus.FAILED
                    ? 'error'
                    : 'default'
              }
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
            {isPinned && zoneName && (
              <Tag
                icon={<PushpinFilled />}
                color="blue"
                onClick={e => {
                  e.stopPropagation();
                  onUnpin?.(session.session_id);
                }}
                style={{ cursor: 'pointer' }}
                title={`Pinned to ${zoneName} (click to unpin)`}
              >
                {zoneName}
              </Tag>
            )}
          </div>
          <Button
            type="text"
            size="small"
            icon={<DragOutlined />}
            className="drag-handle"
            title="Drag to reposition"
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
            {onOpenSettings && (
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined />}
                onClick={e => {
                  e.stopPropagation();
                  onOpenSettings(session.session_id);
                }}
                title="Session settings"
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
        {/* Title/Description */}
        {(session.title || session.description) && (
          <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
            {session.title || session.description}
          </Text>
        )}

        {/* Created By Tag */}
        {session.created_by && (
          <div style={{ marginBottom: 8 }}>
            <CreatedByTag
              createdBy={session.created_by}
              currentUserId={currentUserId}
              users={users}
              prefix="Created by"
            />
          </div>
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

        {/* Concepts - TODO: Re-implement with contextFiles */}
        {/* {session.contextFiles && session.contextFiles.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Space size={4} wrap>
              <Text type="secondary">📦</Text>
              {session.contextFiles.map((file) => (
                <Tag key={file} color="geekblue">
                  {file}
                </Tag>
              ))}
            </Space>
          </div>
        )} */}
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
