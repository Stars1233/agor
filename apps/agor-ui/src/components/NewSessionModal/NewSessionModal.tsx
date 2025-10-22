import { DownOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, Button, Collapse, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { useState } from 'react';
import type { AgenticTool, AgenticToolName, MCPServer, PermissionMode } from '@agor/core/types';
import { AgenticToolConfigForm } from '../AgenticToolConfigForm';
import { AgentSelectionCard } from '../AgentSelectionCard';
import type { ModelConfig } from '../ModelSelector';

const { TextArea } = Input;
const { Text } = Typography;

export interface RepoReferenceOption {
  label: string;
  value: string;
  type: 'managed' | 'managed-worktree';
  description?: string;
}

export interface NewSessionConfig {
  agent: string;
  title?: string;
  initialPrompt?: string;

  // Worktree is now required
  worktreeRef: string; // e.g., "anthropics/agor:main"

  // Advanced configuration
  modelConfig?: ModelConfig;
  mcpServerIds?: string[];
  permissionMode?: PermissionMode;
}

export interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (config: NewSessionConfig) => void;
  onOpenSettings?: () => void; // Callback to open settings modal
  availableAgents: AgenticTool[];

  // Worktree options (from backend) - REQUIRED
  worktreeOptions?: RepoReferenceOption[];

  // MCP servers (from backend)
  mcpServers?: MCPServer[];
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
  open,
  onClose,
  onCreate,
  onOpenSettings,
  availableAgents,
  worktreeOptions = [],
  mcpServers = [],
}) => {
  const [form] = Form.useForm();
  const [selectedAgent, setSelectedAgent] = useState<string | null>('claude-code');
  const [isFormValid, setIsFormValid] = useState(false);

  const hasWorktrees = worktreeOptions.length > 0;

  const handleCreate = () => {
    form
      .validateFields()
      .then(values => {
        if (!selectedAgent) {
          return;
        }

        onCreate({
          agent: selectedAgent || 'claude-code',
          title: values.title,
          initialPrompt: values.initialPrompt,
          worktreeRef: values.worktreeRef,
          modelConfig: values.modelConfig,
          mcpServerIds: values.mcpServerIds,
          permissionMode: values.permissionMode,
        });

        form.resetFields();
        setSelectedAgent('claude-code');
        onClose();
      })
      .catch(errorInfo => {
        // Validation failed - form will show errors automatically
        console.log('Validation failed:', errorInfo);
      });
  };

  const handleCancel = () => {
    form.resetFields();
    setSelectedAgent('claude-code');
    onClose();
  };

  const handleInstall = (agentId: string) => {
    console.log(`Installing agent: ${agentId}`);
    // TODO: Implement installation flow
  };

  // Check form validity without triggering error display
  const handleFormChange = () => {
    // Use setTimeout to debounce and avoid blocking the UI
    setTimeout(() => {
      // Get current form values
      const values = form.getFieldsValue();

      // Check if worktree is selected
      const isValid = !!values.worktreeRef;

      setIsFormValid(isValid);
    }, 0);
  };

  return (
    <Modal
      title="Create New Session"
      open={open}
      onOk={handleCreate}
      onCancel={handleCancel}
      okText="Create Session"
      cancelText="Cancel"
      width={600}
      okButtonProps={{
        disabled: !selectedAgent || !isFormValid || !hasWorktrees,
        title: !hasWorktrees
          ? 'Create a worktree first in Settings → Worktrees'
          : !selectedAgent
            ? 'Please select an agent to continue'
            : !isFormValid
              ? 'Please select a worktree'
              : undefined,
      }}
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
        onFieldsChange={handleFormChange}
        preserve={false}
      >
        <Form.Item label="Select Coding Agent" required>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {!selectedAgent && (
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
                Click on an agent card to select it
              </Text>
            )}
            {availableAgents.map(agent => (
              <AgentSelectionCard
                key={agent.id}
                agent={agent}
                selected={selectedAgent === agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                onInstall={() => handleInstall(agent.id)}
              />
            ))}
          </Space>
        </Form.Item>

        {/* Empty state when no worktrees */}
        {!hasWorktrees && (
          <Alert
            type="warning"
            message="No worktrees available"
            description={
              <Space direction="vertical" size="small">
                <Text>You need to create a worktree before creating a session.</Text>
                <Button
                  type="primary"
                  icon={<SettingOutlined />}
                  onClick={() => {
                    handleCancel();
                    onOpenSettings?.();
                  }}
                >
                  Go to Settings → Worktrees
                </Button>
              </Space>
            }
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Worktree selection */}
        {hasWorktrees && (
          <Form.Item
            name="worktreeRef"
            label="Select Worktree"
            rules={[{ required: true, message: 'Please select a worktree' }]}
            validateTrigger={['onBlur', 'onChange']}
            help="Sessions run in isolated git worktrees"
          >
            <Select
              placeholder="Select worktree..."
              options={worktreeOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        )}

        <Form.Item
          name="title"
          label="Session Title (optional)"
          help="A short descriptive name for this session"
        >
          <Input placeholder="e.g., Auth System Implementation" />
        </Form.Item>

        <Form.Item
          name="initialPrompt"
          label="Initial Prompt (optional)"
          help="What should this session work on?"
        >
          <TextArea
            rows={4}
            placeholder="e.g., Build a JWT authentication system with secure password storage..."
          />
        </Form.Item>

        <Collapse
          ghost
          expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} />}
          items={[
            {
              key: 'agentic-tool-config',
              label: <Text strong>Agentic Tool Configuration</Text>,
              children: (
                <AgenticToolConfigForm
                  agenticTool={(selectedAgent as AgenticToolName) || 'claude-code'}
                  mcpServers={mcpServers}
                  showHelpText={true}
                />
              ),
            },
          ]}
          style={{ marginTop: 16 }}
        />
      </Form>
    </Modal>
  );
};
