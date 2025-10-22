/**
 * Modal for viewing and configuring repository details
 *
 * Tabs:
 * - General: Basic info (name, slug, remote, path)
 * - Environment: Environment config template (Phase 2 feature)
 * - Worktrees: List of worktrees for this repo
 */

import { FolderOutlined, SettingOutlined } from '@ant-design/icons';
import { Modal, Tabs, Typography } from 'antd';
import type { Repo } from '@agor/core/types';

const { Text } = Typography;

interface RepoModalProps {
  open: boolean;
  onClose: () => void;
  repo: Repo;
  onUpdate?: (repoId: string, updates: Partial<Repo>) => void;
}

export const RepoModal: React.FC<RepoModalProps> = ({ open, onClose, repo, onUpdate }) => {
  const tabItems = [
    {
      key: 'general',
      label: 'General',
      children: (
        <div style={{ padding: '16px 24px' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                Repository Name
              </Text>
              <Text strong>{repo.name}</Text>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                Slug
              </Text>
              <Text code>{repo.slug}</Text>
            </div>

            {repo.remote_url && (
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                  Remote URL
                </Text>
                <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                  {repo.remote_url}
                </Text>
              </div>
            )}

            {repo.local_path && (
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                  Local Path
                </Text>
                <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                  {repo.local_path}
                </Text>
              </div>
            )}

            {repo.default_branch && (
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                  Default Branch
                </Text>
                <Text code>{repo.default_branch}</Text>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'environment',
      label: (
        <>
          <SettingOutlined /> Environment
        </>
      ),
      children: (
        <div style={{ padding: '16px 24px' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Environment configuration for this repository. Define commands and template variables
            for starting/stopping environments across all worktrees.
          </Text>
          {/* TODO: Phase 2 - Add environment config form */}
          <div style={{ marginTop: 24 }}>
            <Text type="secondary" italic>
              Environment configuration UI coming in Phase 2
            </Text>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOutlined />
          <span>{repo.name}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
      style={{ top: 40 }}
    >
      <Tabs items={tabItems} />
    </Modal>
  );
};
