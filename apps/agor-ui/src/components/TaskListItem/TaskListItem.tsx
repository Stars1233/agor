import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  EditOutlined,
  FileTextOutlined,
  GithubOutlined,
  LoadingOutlined,
  MessageOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { List, Space, Spin, Tag, Tooltip, Typography, theme } from 'antd';
import type { Task } from '@agor/core/types';

const { Text } = Typography;
const { useToken } = theme;

const TRUNCATION_LENGTH = 120;

interface TaskListItemProps {
  task: Task;
  onClick?: () => void;
  compact?: boolean;
}

const TaskListItem = ({ task, onClick, compact = false }: TaskListItemProps) => {
  const { token } = useToken();

  const getStatusIcon = () => {
    switch (task.status) {
      case 'completed':
        return <CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 16 }} />;
      case 'running':
        return <Spin indicator={<LoadingOutlined spin style={{ fontSize: 16 }} />} />;
      case 'failed':
        return <CloseCircleFilled style={{ color: token.colorError, fontSize: 16 }} />;
      default:
        return <ClockCircleOutlined style={{ color: token.colorTextDisabled, fontSize: 16 }} />;
    }
  };

  const messageCount = task.message_range.end_index - task.message_range.start_index + 1;
  const hasReport = !!task.report;

  // Check if git state is dirty
  const isDirty = task.git_state.sha_at_end?.endsWith('-dirty');
  const cleanSha = task.git_state.sha_at_end?.replace('-dirty', '');

  // Truncate description if too long
  const description = task.description || task.full_prompt || 'Untitled task';
  const isTruncated = description.length > TRUNCATION_LENGTH;
  const displayDescription = isTruncated
    ? `${description.substring(0, TRUNCATION_LENGTH)}...`
    : description;

  return (
    <List.Item
      onClick={onClick}
      style={{
        cursor: 'pointer',
        padding: compact ? '4px 8px' : '8px 12px',
        borderRadius: token.borderRadius,
      }}
    >
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 4 }}>
          <Space size={8}>
            <Tooltip title={<div style={{ whiteSpace: 'pre-wrap' }}>{task.full_prompt}</div>}>
              {getStatusIcon()}
            </Tooltip>
            <Text style={{ fontSize: compact ? 13 : 14, fontWeight: 500 }}>
              {displayDescription}
            </Text>
          </Space>
        </div>

        <div style={{ marginLeft: compact ? 20 : 24 }}>
          <Space size={4} wrap>
            <Tag icon={<MessageOutlined />} color="default">
              {messageCount}
            </Tag>
            <Tag icon={<ToolOutlined />} color="default">
              {task.tool_use_count}
            </Tag>
            {hasReport && (
              <Tag icon={<FileTextOutlined />} color="blue">
                report
              </Tag>
            )}
            {!compact && cleanSha && (
              <Tooltip title={isDirty ? 'Uncommitted changes' : 'Clean git state'}>
                <Tag icon={<GithubOutlined />} color={isDirty ? 'orange' : 'purple'}>
                  <Space size={4}>
                    <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>
                      {cleanSha.substring(0, 7)}
                    </Text>
                    {isDirty && <EditOutlined style={{ fontSize: 10 }} />}
                  </Space>
                </Tag>
              </Tooltip>
            )}
          </Space>
        </div>
      </div>
    </List.Item>
  );
};

export default TaskListItem;
