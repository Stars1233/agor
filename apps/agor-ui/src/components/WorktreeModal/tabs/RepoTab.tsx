import { FolderOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Descriptions, Space, Typography } from 'antd';
import type { Repo } from '@agor/core/types';

const { Text, Paragraph } = Typography;

interface RepoTabProps {
  repo: Repo;
  onOpenSettings?: () => void;
}

export const RepoTab: React.FC<RepoTabProps> = ({ repo, onOpenSettings }) => {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: '0 24px' }}>
      <Paragraph type="secondary">
        This worktree inherits environment configuration from repository "
        <Text strong>{repo.name}</Text>".
      </Paragraph>

      {/* Repository Information */}
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="Name">
          <Space>
            <FolderOutlined />
            <Text strong>{repo.name}</Text>
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="Slug">
          <Text code>{repo.slug}</Text>
        </Descriptions.Item>
        {repo.remote_url && (
          <Descriptions.Item label="Remote URL">
            <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {repo.remote_url}
            </Text>
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Local Path">
          <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
            {repo.local_path}
          </Text>
        </Descriptions.Item>
        {repo.default_branch && (
          <Descriptions.Item label="Default Branch">
            <Text code>{repo.default_branch}</Text>
          </Descriptions.Item>
        )}
      </Descriptions>

      {/* Environment Configuration */}
      {repo.environment_config && (
        <div>
          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
            Environment Configuration
          </Text>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Up Command">
              <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                {repo.environment_config.up_command}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Down Command">
              <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                {repo.environment_config.down_command}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Template Variables">
              {/* biome-ignore lint/suspicious/noExplicitAny: Environment config type needs proper typing */}
              <Text>{(repo.environment_config as any).template_vars?.join(', ') || 'None'}</Text>
            </Descriptions.Item>
          </Descriptions>
        </div>
      )}

      {/* Action Button */}
      <Button
        type="primary"
        icon={<SettingOutlined />}
        onClick={onOpenSettings}
        disabled={!onOpenSettings}
      >
        View Repository Settings
      </Button>

      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        To modify repository configuration or environment settings, navigate to Settings →
        Repositories.
      </Paragraph>
    </Space>
  );
};
