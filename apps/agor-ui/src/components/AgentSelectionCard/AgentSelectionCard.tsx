import { CheckCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
import type { AgenticTool } from '@agor/core/types';
import { ToolIcon } from '../ToolIcon';

const { Text } = Typography;

export interface AgentSelectionCardProps {
  agent: AgenticTool;
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
  const isDisabled = !agent.installed;

  return (
    <Card
      hoverable={!isDisabled}
      onClick={isDisabled ? undefined : onClick}
      style={{
        borderColor: selected ? '#1890ff' : undefined,
        borderWidth: selected ? 2 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
      }}
      styles={{
        body: { padding: 12 },
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} size={8}>
          <Space size={8}>
            <ToolIcon tool={agent.id} size={24} />
            <Text strong style={{ fontSize: '14px' }}>
              {agent.name}
            </Text>
            {agent.installed ? (
              <Tag
                icon={<CheckCircleOutlined />}
                color="success"
                style={{ fontSize: '11px', padding: '0 6px' }}
              >
                Installed
              </Tag>
            ) : (
              <Tag color="orange" style={{ fontSize: '11px', padding: '0 6px' }}>
                COMING SOON
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
