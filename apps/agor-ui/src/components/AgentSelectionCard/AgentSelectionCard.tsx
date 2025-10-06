import { CheckCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
import type { Agent } from '../../types';

const { Text } = Typography;

export interface AgentSelectionCardProps {
  agent: Agent;
  selected?: boolean;
  onClick?: () => void;
  onInstall?: () => void;
}

export const AgentSelectionCard: React.FC<AgentSelectionCardProps> = ({
  agent,
  selected = false,
  onClick,
  onInstall,
}) => {
  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        borderColor: selected ? '#1890ff' : undefined,
        borderWidth: selected ? 2 : 1,
        cursor: 'pointer',
      }}
      styles={{
        body: { padding: 12 },
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} size={8}>
          <Space size={8}>
            <Text style={{ fontSize: '18px' }}>{agent.icon}</Text>
            <Text strong style={{ fontSize: '14px' }}>
              {agent.name}
            </Text>
            {agent.installed && (
              <Tag
                icon={<CheckCircleOutlined />}
                color="success"
                style={{ fontSize: '11px', padding: '0 6px' }}
              >
                Installed
              </Tag>
            )}
          </Space>
          {!agent.installed && agent.installable && (
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={e => {
                e.stopPropagation();
                onInstall?.();
              }}
            >
              Install
            </Button>
          )}
        </Space>

        {agent.version && (
          <Text type="secondary" style={{ fontSize: '11px' }}>
            Version: {agent.version}
          </Text>
        )}

        {agent.description && (
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {agent.description}
          </Text>
        )}
      </Space>
    </Card>
  );
};
