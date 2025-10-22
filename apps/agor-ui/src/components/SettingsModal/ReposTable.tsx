import { DeleteOutlined, FolderOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Form, Input, Modal, Popconfirm, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { Repo } from '@agor/core/types';

const { Text } = Typography;

// Utility: Extract slug from Git URL (org/repo format)
function extractSlugFromUrl(url: string): string {
  try {
    // Remove .git suffix if present
    const cleanUrl = url.endsWith('.git') ? url.slice(0, -4) : url;

    // Handle SSH format: git@github.com:org/repo
    if (cleanUrl.includes('@')) {
      const match = cleanUrl.match(/:([^/]+\/[^/]+)$/);
      if (match) {
        return match[1];
      }
    }

    // Handle HTTPS format: https://github.com/org/repo
    const match = cleanUrl.match(/[:/]([^/]+\/[^/]+)$/);
    if (match) {
      return match[1];
    }

    // Fallback: use last two path segments
    const segments = cleanUrl.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
    }

    return '';
  } catch {
    return '';
  }
}

interface ReposTableProps {
  repos: Repo[];
  onCreate?: (data: { url: string; slug: string }) => void;
  onDelete?: (repoId: string) => void;
}

export const ReposTable: React.FC<ReposTableProps> = ({ repos, onCreate, onDelete }) => {
  const [createRepoModalOpen, setCreateRepoModalOpen] = useState(false);
  const [repoForm] = Form.useForm();

  // Auto-extract slug when URL changes in repo form
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    if (url) {
      const slug = extractSlugFromUrl(url);
      if (slug) {
        repoForm.setFieldsValue({ slug });
      }
    }
  };

  const handleDeleteRepo = (repoId: string) => {
    onDelete?.(repoId);
  };

  const handleCreateRepo = () => {
    repoForm.validateFields().then(values => {
      onCreate?.({
        url: values.url,
        slug: values.slug,
      });
      repoForm.resetFields();
      setCreateRepoModalOpen(false);
    });
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text type="secondary">Clone and manage git repositories for your sessions.</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateRepoModalOpen(true)}>
          New Repository
        </Button>
      </div>

      {repos.length === 0 && (
        <Empty description="No repositories yet" style={{ marginTop: 32, marginBottom: 32 }}>
          <Text type="secondary">Click "New Repository" to clone a git repository.</Text>
        </Empty>
      )}

      {repos.length > 0 && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {repos.map(repo => (
            <Card
              key={repo.repo_id}
              size="small"
              title={
                <Space>
                  <FolderOutlined />
                  <Text strong>{repo.name}</Text>
                  <Tag color="blue" style={{ marginLeft: 8 }}>
                    Managed
                  </Tag>
                </Space>
              }
              extra={
                <Popconfirm
                  title="Delete repository?"
                  description={
                    <>
                      <p>Are you sure you want to delete "{repo.name}"?</p>
                      <p style={{ color: '#ff4d4f' }}>
                        ⚠️ This will delete the local repository and all associated worktrees.
                      </p>
                    </>
                  }
                  onConfirm={() => handleDeleteRepo(repo.repo_id)}
                  okText="Delete"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                </Popconfirm>
              }
            >
              {/* Repo metadata */}
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Slug:{' '}
                  </Text>
                  <Text code style={{ fontSize: 12 }}>
                    {repo.slug}
                  </Text>
                </div>

                {repo.remote_url && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Remote:{' '}
                    </Text>
                    <Text code style={{ fontSize: 11 }}>
                      {repo.remote_url}
                    </Text>
                  </div>
                )}

                {repo.local_path && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Path:{' '}
                    </Text>
                    <Text code style={{ fontSize: 11 }}>
                      {repo.local_path}
                    </Text>
                  </div>
                )}
              </Space>
            </Card>
          ))}
        </Space>
      )}

      {/* Create Repository Modal */}
      <Modal
        title="Clone Repository"
        open={createRepoModalOpen}
        onOk={handleCreateRepo}
        onCancel={() => {
          repoForm.resetFields();
          setCreateRepoModalOpen(false);
        }}
        okText="Clone"
      >
        <Form form={repoForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Repository URL"
            name="url"
            rules={[{ required: true, message: 'Please enter a git repository URL' }]}
            extra="HTTPS or SSH URL"
          >
            <Input
              placeholder="https://github.com/apache/superset.git"
              onChange={handleUrlChange}
            />
          </Form.Item>

          <Form.Item
            label="Repository Slug"
            name="slug"
            rules={[
              { required: true, message: 'Please enter a slug' },
              {
                pattern: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/,
                message: 'Slug must be in org/repo format (e.g., apache/superset)',
              },
            ]}
            extra="Auto-detected from URL (editable). Format: org/repo"
          >
            <Input placeholder="apache/superset" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
