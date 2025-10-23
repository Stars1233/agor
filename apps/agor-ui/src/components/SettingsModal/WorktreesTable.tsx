import { renderTemplate } from '@agor/core/templates/handlebars-helpers';
import type { Repo, Session, Worktree } from '@agor/core/types';
import {
  BranchesOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  GlobalOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  PoweroffOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { useState } from 'react';
import { DeleteWorktreePopconfirm } from '../DeleteWorktreePopconfirm';

const { Text } = Typography;

interface WorktreesTableProps {
  worktrees: Worktree[];
  repos: Repo[];
  sessions: Session[];
  onDelete?: (worktreeId: string, deleteFromFilesystem: boolean) => void;
  onCreate?: (
    repoId: string,
    data: {
      name: string;
      ref: string;
      createBranch: boolean;
      sourceBranch: string;
      pullLatest: boolean;
    }
  ) => void;
  onRowClick?: (worktree: Worktree) => void;
  onStartEnvironment?: (worktreeId: string) => void;
  onStopEnvironment?: (worktreeId: string) => void;
}

export const WorktreesTable: React.FC<WorktreesTableProps> = ({
  worktrees,
  repos,
  sessions,
  onDelete,
  onCreate,
  onRowClick,
  onStartEnvironment,
  onStopEnvironment,
}) => {
  const { token } = theme.useToken();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [useSameBranchName, setUseSameBranchName] = useState(true);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);

  // Helper to get repo name from repo_id
  const getRepoName = (repoId: string): string => {
    const repo = repos.find(r => r.repo_id === repoId);
    return repo?.name || 'Unknown Repo';
  };

  // Helper to get environment status icon
  const getEnvStatusIcon = (worktree: Worktree) => {
    const status = worktree.environment_instance?.status;
    const healthStatus = worktree.environment_instance?.last_health_check?.status;

    if (!status || status === 'stopped') {
      return (
        <Tooltip title="Environment stopped">
          <MinusCircleOutlined style={{ color: token.colorTextDisabled }} />
        </Tooltip>
      );
    }

    if (status === 'starting' || status === 'stopping') {
      return (
        <Tooltip title={`Environment ${status}`}>
          <LoadingOutlined style={{ color: token.colorPrimary }} />
        </Tooltip>
      );
    }

    if (status === 'error') {
      return (
        <Tooltip
          title={`Error: ${worktree.environment_instance?.last_health_check?.message || 'Unknown'}`}
        >
          <CloseCircleOutlined style={{ color: token.colorError }} />
        </Tooltip>
      );
    }

    if (status === 'running') {
      // Show health status if available
      if (healthStatus === 'healthy') {
        return (
          <Tooltip title="Running (healthy)">
            <CheckCircleOutlined style={{ color: token.colorSuccess }} />
          </Tooltip>
        );
      }
      if (healthStatus === 'unhealthy') {
        return (
          <Tooltip
            title={`Running (unhealthy): ${worktree.environment_instance?.last_health_check?.message || ''}`}
          >
            <WarningOutlined style={{ color: token.colorWarning }} />
          </Tooltip>
        );
      }
      // Running but no health check yet
      return (
        <Tooltip title="Running">
          <Badge status="processing" />
        </Tooltip>
      );
    }

    return null;
  };

  // Get selected repo's default branch
  const getDefaultBranch = (): string => {
    if (!selectedRepoId) return 'main';
    const repo = repos.find(r => r.repo_id === selectedRepoId);
    return repo?.default_branch || 'main';
  };

  // Update source branch when repo changes
  const handleRepoChange = (repoId: string) => {
    setSelectedRepoId(repoId);
    const repo = repos.find(r => r.repo_id === repoId);
    const defaultBranch = repo?.default_branch || 'main';
    form.setFieldValue('sourceBranch', defaultBranch);
  };

  const handleDelete = (worktreeId: string, deleteFromFilesystem: boolean) => {
    onDelete?.(worktreeId, deleteFromFilesystem);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const branchName = useSameBranchName ? values.name : values.branchName;

      onCreate?.(values.repoId, {
        name: values.name,
        ref: branchName,
        createBranch: true, // Always create new branch based on source branch
        sourceBranch: values.sourceBranch,
        pullLatest: true, // Always fetch latest before creating worktree
      });
      setCreateModalOpen(false);
      form.resetFields();
      setUseSameBranchName(true);
      setSelectedRepoId(null);
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleCancel = () => {
    setCreateModalOpen(false);
    form.resetFields();
    setUseSameBranchName(true);
    setSelectedRepoId(null);
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, _record: Worktree) => (
        <Space>
          <BranchesOutlined />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Env',
      key: 'env',
      width: 120,
      align: 'center' as const,
      render: (_: unknown, record: Worktree) => {
        const status = record.environment_instance?.status;
        const healthStatus = record.environment_instance?.last_health_check?.status;
        const repo = repos.find(r => r.repo_id === record.repo_id);
        const hasEnvConfig = !!repo?.environment_config;

        const isRunningOrHealthy =
          status === 'running' || status === 'starting' || healthStatus === 'healthy';

        return (
          <Space size={4}>
            {getEnvStatusIcon(record)}
            {hasEnvConfig && (
              <>
                <Button
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  disabled={isRunningOrHealthy}
                  onClick={e => {
                    e.stopPropagation();
                    onStartEnvironment?.(record.worktree_id);
                  }}
                  style={{ padding: '0 4px' }}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<PoweroffOutlined />}
                  onClick={e => {
                    e.stopPropagation();
                    onStopEnvironment?.(record.worktree_id);
                  }}
                  style={{ padding: '0 4px' }}
                />
                {repo.environment_config?.health_check?.url_template && (
                  <Button
                    type="text"
                    size="small"
                    icon={<GlobalOutlined />}
                    onClick={e => {
                      e.stopPropagation();
                      // Render the URL template with worktree context
                      const templateContext = {
                        worktree: {
                          unique_id: record.worktree_unique_id,
                          name: record.name,
                          path: record.path,
                        },
                        repo: {
                          slug: repo.slug,
                        },
                      };
                      const url = renderTemplate(
                        repo.environment_config.health_check.url_template,
                        templateContext
                      );
                      window.open(url, '_blank');
                    }}
                    style={{ padding: '0 4px' }}
                  />
                )}
              </>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Repo',
      dataIndex: 'repo_id',
      key: 'repo_id',
      render: (repoId: string) => (
        <Space>
          <FolderOutlined />
          <Text>{getRepoName(repoId)}</Text>
        </Space>
      ),
    },
    {
      title: 'Branch',
      dataIndex: 'ref',
      key: 'ref',
      render: (ref: string) => <Text code>{ref}</Text>,
    },
    {
      title: 'Sessions',
      dataIndex: 'sessions',
      key: 'sessions',
      width: 100,
      render: (sessions: string[]) => (
        <Text type="secondary">
          {sessions?.length || 0} {sessions?.length === 1 ? 'session' : 'sessions'}
        </Text>
      ),
    },
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
      render: (path: string) => (
        <Text code style={{ fontSize: 11 }}>
          {path}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Worktree) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={e => {
              e.stopPropagation();
              onRowClick?.(record);
            }}
          />
          <DeleteWorktreePopconfirm
            worktree={record}
            sessionCount={sessions.filter(s => s.worktree_id === record.worktree_id).length}
            onConfirm={deleteFromFilesystem =>
              handleDelete(record.worktree_id, deleteFromFilesystem)
            }
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              onClick={e => e.stopPropagation()}
            />
          </DeleteWorktreePopconfirm>
        </Space>
      ),
    },
  ];

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
        <Text type="secondary">
          Manage git worktrees for isolated development contexts across sessions.
        </Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalOpen(true)}
          disabled={repos.length === 0}
        >
          Create Worktree
        </Button>
      </div>

      {!worktrees && <Empty description="Loading worktrees..." />}

      {worktrees && repos.length === 0 && (
        <Empty description="No repositories configured">
          <Text type="secondary">
            Create a repository first in the Repositories tab to enable worktrees.
          </Text>
        </Empty>
      )}

      {repos.length > 0 && worktrees.length === 0 && (
        <Empty description="No worktrees yet">
          <Text type="secondary">
            Worktrees will appear here once created from sessions or the CLI.
          </Text>
        </Empty>
      )}

      {worktrees.length > 0 && (
        <Table
          dataSource={worktrees}
          columns={columns}
          rowKey="worktree_id"
          pagination={{ pageSize: 10 }}
          size="small"
          onRow={record => ({
            onClick: () => onRowClick?.(record),
            style: { cursor: onRowClick ? 'pointer' : 'default' },
          })}
        />
      )}

      <Modal
        title="Create Worktree"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={handleCancel}
        okText="Create"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="repoId"
            label="Repository"
            rules={[{ required: true, message: 'Please select a repository' }]}
          >
            <Select
              placeholder="Select a repository"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={repos.map(repo => ({
                value: repo.repo_id,
                label: repo.name,
              }))}
              onChange={handleRepoChange}
            />
          </Form.Item>

          <Form.Item
            name="sourceBranch"
            label="Source Branch"
            rules={[{ required: true, message: 'Please enter source branch' }]}
            tooltip="Branch to use as base for the new worktree branch"
            initialValue="main"
          >
            <Input placeholder="main" />
          </Form.Item>

          <Form.Item
            name="name"
            label="Worktree Name"
            rules={[
              { required: true, message: 'Please enter a worktree name' },
              {
                pattern: /^[a-z0-9-]+$/,
                message: 'Only lowercase letters, numbers, and hyphens allowed',
              },
            ]}
            tooltip="URL-friendly name (e.g., 'feat-auth', 'fix-cors')"
          >
            <Input placeholder="feat-auth" />
          </Form.Item>

          <Form.Item>
            <Checkbox
              checked={useSameBranchName}
              onChange={e => setUseSameBranchName(e.target.checked)}
            >
              Use worktree name as branch name
            </Checkbox>
          </Form.Item>

          {!useSameBranchName && (
            <Form.Item
              name="branchName"
              label="Branch Name"
              rules={[{ required: true, message: 'Please enter branch name' }]}
            >
              <Input placeholder="feature/auth" />
            </Form.Item>
          )}

          <Typography.Paragraph type="secondary">
            <strong>What will happen:</strong>
            <br />• Fetch latest from origin
            <br />• Create new branch{' '}
            <Text code>{useSameBranchName ? '<worktree-name>' : '<branch-name>'}</Text> based on{' '}
            <Text code>{form.getFieldValue('sourceBranch') || getDefaultBranch()}</Text>
            <br />• Worktree location:{' '}
            <Text code>
              ~/.agor/worktrees/{'<repo>'}/<Text italic>{'<name>'}</Text>
            </Text>
          </Typography.Paragraph>
        </Form>
      </Modal>
    </div>
  );
};
