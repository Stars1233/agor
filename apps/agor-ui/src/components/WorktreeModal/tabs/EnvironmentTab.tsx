/**
 * Environment Tab - Two-level UI for environment management
 *
 * 1. Repository Template (top) - Editable commands that affect all worktrees
 * 2. Worktree Instance (bottom) - This worktree's variables and preview
 */

import type { Repo, RepoEnvironmentConfig, Worktree } from '@agor/core/types';
import { renderTemplate } from '@agor/core/templates/handlebars-helpers';
import {
  CodeOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Empty,
  Input,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useState, useMemo } from 'react';
import { theme } from 'antd';

const { Text, Paragraph, Title } = Typography;
const { TextArea } = Input;

interface EnvironmentTabProps {
  worktree: Worktree;
  repo: Repo;
  onUpdateRepo?: (repoId: string, updates: Partial<Repo>) => void;
  onUpdateWorktree?: (worktreeId: string, updates: Partial<Worktree>) => void;
}

export const EnvironmentTab: React.FC<EnvironmentTabProps> = ({
  worktree,
  repo,
  onUpdateRepo,
  onUpdateWorktree,
}) => {
  const { token } = theme.useToken();
  const hasEnvironmentConfig = !!repo.environment_config;

  // Repository template state (editable)
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [upCommand, setUpCommand] = useState(repo.environment_config?.up_command || '');
  const [downCommand, setDownCommand] = useState(repo.environment_config?.down_command || '');
  const [healthCheckUrl, setHealthCheckUrl] = useState(
    repo.environment_config?.health_check?.url_template || ''
  );

  // Custom context state (editable)
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [customContextJson, setCustomContextJson] = useState(
    JSON.stringify(worktree.custom_context || {}, null, 2)
  );

  // Check if template has unsaved changes
  const hasTemplateChanges = useMemo(() => {
    if (!repo.environment_config) return upCommand || downCommand || healthCheckUrl;
    return (
      upCommand !== repo.environment_config.up_command ||
      downCommand !== repo.environment_config.down_command ||
      healthCheckUrl !== (repo.environment_config.health_check?.url_template || '')
    );
  }, [upCommand, downCommand, healthCheckUrl, repo.environment_config]);

  // Build template context for preview
  const templateContext = useMemo(() => {
    let customContext = {};
    try {
      customContext = JSON.parse(customContextJson);
    } catch {
      // Invalid JSON, use empty object
    }

    return {
      worktree: {
        unique_id: worktree.worktree_unique_id,
        name: worktree.name,
        path: worktree.path,
      },
      repo: {
        slug: repo.slug,
      },
      custom: customContext,
    };
  }, [worktree, repo, customContextJson]);

  // Render template with current context
  const renderPreview = (template: string): { success: boolean; result: string } => {
    try {
      const result = renderTemplate(template, templateContext);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        result: error instanceof Error ? error.message : 'Template error',
      };
    }
  };

  const handleSaveTemplate = () => {
    if (!onUpdateRepo) return;

    const newConfig: RepoEnvironmentConfig = {
      up_command: upCommand,
      down_command: downCommand,
      health_check: healthCheckUrl
        ? {
            type: 'http',
            url_template: healthCheckUrl,
          }
        : undefined,
    };

    onUpdateRepo(repo.repo_id, {
      environment_config: newConfig,
    });

    setIsEditingTemplate(false);
  };

  const handleSaveContext = () => {
    if (!onUpdateWorktree) return;

    try {
      const parsed = JSON.parse(customContextJson);
      onUpdateWorktree(worktree.worktree_id, {
        custom_context: parsed,
      });
      setIsEditingContext(false);
    } catch (error) {
      // TODO: Show error toast
      console.error('Invalid JSON:', error);
    }
  };

  const handleCancelTemplate = () => {
    setUpCommand(repo.environment_config?.up_command || '');
    setDownCommand(repo.environment_config?.down_command || '');
    setHealthCheckUrl(repo.environment_config?.health_check?.url_template || '');
    setIsEditingTemplate(false);
  };

  const handleCancelContext = () => {
    setCustomContextJson(JSON.stringify(worktree.custom_context || {}, null, 2));
    setIsEditingContext(false);
  };

  // Auto-enable editing if no config exists
  if (!hasEnvironmentConfig && !isEditingTemplate) {
    // Automatically show the form in edit mode
    setTimeout(() => setIsEditingTemplate(true), 0);
  }

  const upPreview = renderPreview(upCommand);
  const downPreview = renderPreview(downCommand);
  const healthPreview = healthCheckUrl ? renderPreview(healthCheckUrl) : null;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: '0 24px' }}>
      <Alert
        message="Environment Management (Phase 1)"
        description="Configuration and preview are ready. Start/stop/restart functionality will be implemented in Phase 2."
        type="info"
        icon={<InfoCircleOutlined />}
        showIcon
      />

      {/* ========== REPOSITORY TEMPLATE (Top Level) ========== */}
      <Card
        title={
          <Space>
            <CodeOutlined />
            <span>Repository Environment Template</span>
            <Tag color="orange" style={{ fontSize: 10 }}>
              Affects all worktrees on this repository
            </Tag>
          </Space>
        }
        size="small"
        extra={
          !isEditingTemplate && (
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setIsEditingTemplate(true)}
            >
              Edit
            </Button>
          )
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Up Command */}
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Up Command (Start Environment)
            </Text>
            {isEditingTemplate ? (
              <TextArea
                value={upCommand}
                onChange={e => setUpCommand(e.target.value)}
                placeholder="UI_PORT={{add 9000 worktree.unique_id}} DAEMON_PORT={{add 8000 worktree.unique_id}} pnpm dev"
                rows={3}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
              />
            ) : (
              <Text
                code
                style={{ fontSize: 11, wordBreak: 'break-all', display: 'block', padding: 8 }}
              >
                {upCommand || <Text type="secondary">Not configured</Text>}
              </Text>
            )}
          </div>

          {/* Down Command */}
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Down Command (Stop Environment)
            </Text>
            {isEditingTemplate ? (
              <TextArea
                value={downCommand}
                onChange={e => setDownCommand(e.target.value)}
                placeholder="pkill -f 'vite.*{{add 9000 worktree.unique_id}}'"
                rows={2}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
              />
            ) : (
              <Text
                code
                style={{ fontSize: 11, wordBreak: 'break-all', display: 'block', padding: 8 }}
              >
                {downCommand || <Text type="secondary">Not configured</Text>}
              </Text>
            )}
          </div>

          {/* Health Check URL */}
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Health Check URL (Optional)
            </Text>
            {isEditingTemplate ? (
              <Input
                value={healthCheckUrl}
                onChange={e => setHealthCheckUrl(e.target.value)}
                placeholder="http://localhost:{{add 9000 worktree.unique_id}}/health"
                style={{ fontFamily: 'monospace', fontSize: 11 }}
              />
            ) : (
              <Text
                code
                style={{ fontSize: 11, wordBreak: 'break-all', display: 'block', padding: 8 }}
              >
                {healthCheckUrl || <Text type="secondary">Not configured</Text>}
              </Text>
            )}
          </div>

          {/* Available Variables Info */}
          {isEditingTemplate && (
            <Alert
              message="Available Template Variables"
              description={
                <div style={{ fontSize: 11, lineHeight: '1.6' }}>
                  <div>
                    <Text code>{'{{worktree.unique_id}}'}</Text> - Auto-assigned unique number (1,
                    2, 3, ...)
                  </div>
                  <div>
                    <Text code>{'{{worktree.name}}'}</Text> - Worktree name (e.g., "feat-auth")
                  </div>
                  <div>
                    <Text code>{'{{worktree.path}}'}</Text> - Absolute path to worktree directory
                  </div>
                  <div>
                    <Text code>{'{{repo.slug}}'}</Text> - Repository slug
                  </div>
                  <div>
                    <Text code>{'{{add a b}}'}</Text> - Math helpers (add, sub, mul, div, mod)
                  </div>
                  <div>
                    <Text code>{'{{custom.your_var}}'}</Text> - Custom variables (see below)
                  </div>
                </div>
              }
              type="info"
              showIcon={false}
              style={{ marginTop: 8 }}
            />
          )}

          {/* Save/Cancel Buttons */}
          {isEditingTemplate && (
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveTemplate}
                disabled={!hasTemplateChanges}
              >
                Save Template
              </Button>
              <Button onClick={handleCancelTemplate}>Cancel</Button>
            </Space>
          )}
        </Space>
      </Card>

      <Divider style={{ margin: '8px 0' }} />

      {/* ========== WORKTREE INSTANCE (Bottom Level) ========== */}
      <Card
        title={
          <Space>
            <PlayCircleOutlined />
            <span>Worktree Instance: {worktree.name}</span>
          </Space>
        }
        size="small"
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Built-in Variables (Read-only) */}
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              Built-in Variables
            </Text>
            <Descriptions column={1} bordered size="small" style={{ fontSize: 11 }}>
              <Descriptions.Item label="worktree.unique_id">
                <Text code>{worktree.worktree_unique_id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="worktree.name">
                <Text code>{worktree.name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="worktree.path">
                <Text code style={{ fontSize: 10 }}>
                  {worktree.path}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="repo.slug">
                <Text code>{repo.slug}</Text>
              </Descriptions.Item>
            </Descriptions>
          </div>

          {/* Custom Context (Editable) */}
          <div>
            <Space
              style={{
                width: '100%',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <Text strong style={{ fontSize: 13 }}>
                Custom Context (JSON)
              </Text>
              {!isEditingContext && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setIsEditingContext(true)}
                >
                  Edit
                </Button>
              )}
            </Space>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Define custom variables accessible as{' '}
              <Text code style={{ fontSize: 11 }}>
                {'{{custom.your_var}}'}
              </Text>{' '}
              in templates
            </Text>
            {isEditingContext ? (
              <>
                <TextArea
                  value={customContextJson}
                  onChange={e => setCustomContextJson(e.target.value)}
                  placeholder='{\n  "feature_name": "authentication",\n  "extra_port": 3001\n}'
                  rows={6}
                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                />
                <Space style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<SaveOutlined />}
                    onClick={handleSaveContext}
                  >
                    Save Context
                  </Button>
                  <Button size="small" onClick={handleCancelContext}>
                    Cancel
                  </Button>
                </Space>
              </>
            ) : (
              <Text
                code
                style={{
                  fontSize: 11,
                  wordBreak: 'break-all',
                  display: 'block',
                  padding: 8,
                  background: '#f5f5f5',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {customContextJson}
              </Text>
            )}
          </div>

          {/* Resolved Commands Preview */}
          {hasEnvironmentConfig && (
            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                Resolved Commands (Live Preview)
              </Text>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {/* Up Command Preview */}
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Up:
                  </Text>
                  <Text
                    code
                    style={{
                      fontSize: 11,
                      display: 'block',
                      padding: 8,
                      background: upPreview.success
                        ? token.colorSuccessBg
                        : token.colorErrorBg,
                      border: `1px solid ${upPreview.success ? token.colorSuccessBorder : token.colorErrorBorder}`,
                      color: upPreview.success ? token.colorSuccessText : token.colorErrorText,
                      marginTop: 4,
                      wordBreak: 'break-all',
                    }}
                  >
                    {upPreview.result}
                  </Text>
                </div>

                {/* Down Command Preview */}
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Down:
                  </Text>
                  <Text
                    code
                    style={{
                      fontSize: 11,
                      display: 'block',
                      padding: 8,
                      background: downPreview.success
                        ? token.colorSuccessBg
                        : token.colorErrorBg,
                      border: `1px solid ${downPreview.success ? token.colorSuccessBorder : token.colorErrorBorder}`,
                      color: downPreview.success
                        ? token.colorSuccessText
                        : token.colorErrorText,
                      marginTop: 4,
                      wordBreak: 'break-all',
                    }}
                  >
                    {downPreview.result}
                  </Text>
                </div>

                {/* Health Check Preview */}
                {healthPreview && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Health Check:
                    </Text>
                    <Text
                      code
                      style={{
                        fontSize: 11,
                        display: 'block',
                        padding: 8,
                        background: healthPreview.success
                          ? token.colorSuccessBg
                          : token.colorErrorBg,
                        border: `1px solid ${healthPreview.success ? token.colorSuccessBorder : token.colorErrorBorder}`,
                        color: healthPreview.success
                          ? token.colorSuccessText
                          : token.colorErrorText,
                        marginTop: 4,
                        wordBreak: 'break-all',
                      }}
                    >
                      {healthPreview.result}
                    </Text>
                  </div>
                )}
              </Space>
            </div>
          )}

          {/* Environment Status (Phase 2 - Coming soon) */}
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              Environment Status
            </Text>
            <Alert
              message="Coming in Phase 2"
              description="Start/stop controls, health monitoring, and log viewing will be available soon."
              type="info"
              showIcon
              style={{ fontSize: 11 }}
            />
          </div>
        </Space>
      </Card>
    </Space>
  );
};
