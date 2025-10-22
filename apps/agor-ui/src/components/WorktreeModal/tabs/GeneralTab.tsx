import { DeleteOutlined, EditOutlined, FolderOutlined, LinkOutlined } from '@ant-design/icons';
import {
  Button,
  Descriptions,
  Input,
  List,
  message,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import type { Repo, Session, Worktree } from '@agor/core/types';
import { TaskStatus } from '@agor/core/types';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface GeneralTabProps {
  worktree: Worktree;
  repo: Repo;
  sessions: Session[];
  onUpdate?: (worktreeId: string, updates: Partial<Worktree>) => void;
  onDelete?: (worktreeId: string) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
  worktree,
  repo,
  sessions,
  onUpdate,
  onDelete,
}) => {
  const [editingIssue, setEditingIssue] = useState(false);
  const [editingPR, setEditingPR] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const [issueUrl, setIssueUrl] = useState(worktree.issue_url || '');
  const [prUrl, setPrUrl] = useState(worktree.pull_request_url || '');
  const [notes, setNotes] = useState(worktree.notes || '');

  const handleSaveIssue = () => {
    onUpdate?.(worktree.worktree_id, { issue_url: issueUrl || undefined });
    setEditingIssue(false);
    message.success('Issue URL updated');
  };

  const handleSavePR = () => {
    onUpdate?.(worktree.worktree_id, { pull_request_url: prUrl || undefined });
    setEditingPR(false);
    message.success('Pull request URL updated');
  };

  const handleSaveNotes = () => {
    onUpdate?.(worktree.worktree_id, { notes: notes || undefined });
    setEditingNotes(false);
    message.success('Notes updated');
  };

  const handleDelete = () => {
    onDelete?.(worktree.worktree_id);
  };

  const activeSessions = sessions.filter(s => s.status === TaskStatus.RUNNING);
  const _completedSessions = sessions.filter(s => s.status === TaskStatus.COMPLETED);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: '0 24px' }}>
      {/* Basic Information */}
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="Name">
          <Text strong>{worktree.name}</Text>
          {worktree.new_branch && (
            <Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>
              New Branch
            </Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Path">
          <Text code style={{ fontSize: 11 }}>
            {worktree.path}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Repository">
          <Space>
            <FolderOutlined />
            <Text>{repo.name}</Text>
          </Space>
        </Descriptions.Item>
      </Descriptions>

      {/* Git Information */}
      <div>
        <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
          Git Information
        </Text>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Branch">
            <Text code>{worktree.ref}</Text>
          </Descriptions.Item>
          {worktree.base_ref && (
            <Descriptions.Item label="Base">
              <Text code>
                {worktree.base_ref}
                {worktree.base_sha && ` (${worktree.base_sha.substring(0, 7)})`}
              </Text>
            </Descriptions.Item>
          )}
          {worktree.tracking_branch && (
            <Descriptions.Item label="Tracking">
              <Text code>{worktree.tracking_branch}</Text>
            </Descriptions.Item>
          )}
          {worktree.last_commit_sha && (
            <Descriptions.Item label="Current SHA">
              <Text code>{worktree.last_commit_sha.substring(0, 7)}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </div>

      {/* Work Context */}
      <div>
        <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
          Work Context
        </Text>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Issue URL */}
          <div>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text type="secondary">Issue:</Text>
              {!editingIssue && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditingIssue(true)}
                >
                  Edit
                </Button>
              )}
            </Space>
            {editingIssue ? (
              <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                <Input
                  value={issueUrl}
                  onChange={e => setIssueUrl(e.target.value)}
                  placeholder="https://github.com/user/repo/issues/42"
                  prefix={<LinkOutlined />}
                />
                <Button type="primary" onClick={handleSaveIssue}>
                  Save
                </Button>
                <Button
                  onClick={() => {
                    setIssueUrl(worktree.issue_url || '');
                    setEditingIssue(false);
                  }}
                >
                  Cancel
                </Button>
              </Space.Compact>
            ) : worktree.issue_url ? (
              <a href={worktree.issue_url} target="_blank" rel="noopener noreferrer">
                <Text code style={{ fontSize: 12 }}>
                  {worktree.issue_url}
                </Text>
              </a>
            ) : (
              <Text type="secondary" italic>
                No issue linked
              </Text>
            )}
          </div>

          {/* Pull Request URL */}
          <div>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text type="secondary">Pull Request:</Text>
              {!editingPR && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditingPR(true)}
                >
                  Edit
                </Button>
              )}
            </Space>
            {editingPR ? (
              <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                <Input
                  value={prUrl}
                  onChange={e => setPrUrl(e.target.value)}
                  placeholder="https://github.com/user/repo/pull/43"
                  prefix={<LinkOutlined />}
                />
                <Button type="primary" onClick={handleSavePR}>
                  Save
                </Button>
                <Button
                  onClick={() => {
                    setPrUrl(worktree.pull_request_url || '');
                    setEditingPR(false);
                  }}
                >
                  Cancel
                </Button>
              </Space.Compact>
            ) : worktree.pull_request_url ? (
              <a href={worktree.pull_request_url} target="_blank" rel="noopener noreferrer">
                <Text code style={{ fontSize: 12 }}>
                  {worktree.pull_request_url}
                </Text>
              </a>
            ) : (
              <Text type="secondary" italic>
                No pull request linked
              </Text>
            )}
          </div>

          {/* Notes */}
          <div>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text type="secondary">Notes:</Text>
              {!editingNotes && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditingNotes(true)}
                >
                  Edit
                </Button>
              )}
            </Space>
            {editingNotes ? (
              <div style={{ marginTop: 4 }}>
                <TextArea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Freeform notes about this worktree..."
                  rows={4}
                />
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" onClick={handleSaveNotes}>
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setNotes(worktree.notes || '');
                      setEditingNotes(false);
                    }}
                  >
                    Cancel
                  </Button>
                </Space>
              </div>
            ) : worktree.notes ? (
              <Paragraph
                style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 4,
                  marginTop: 4,
                  marginBottom: 0,
                }}
              >
                {worktree.notes}
              </Paragraph>
            ) : (
              <Text type="secondary" italic>
                No notes
              </Text>
            )}
          </div>
        </Space>
      </div>

      {/* Active Sessions */}
      <div>
        <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
          Active Sessions ({activeSessions.length})
        </Text>
        {activeSessions.length > 0 ? (
          <List
            size="small"
            bordered
            dataSource={activeSessions}
            renderItem={session => (
              <List.Item>
                <Space>
                  <Text code style={{ fontSize: 11 }}>
                    {session.session_id.substring(0, 8)}
                  </Text>
                  <Text>{session.title || session.description || 'Untitled session'}</Text>
                  <Tag color="processing">Running</Tag>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Text type="secondary" italic>
            No active sessions
          </Text>
        )}
      </div>

      {/* Timestamps */}
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="Created">
          {new Date(worktree.created_at).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="Last Used">
          {worktree.last_used ? new Date(worktree.last_used).toLocaleString() : 'Never'}
        </Descriptions.Item>
      </Descriptions>

      {/* Actions */}
      <Space>
        <Popconfirm
          title="Delete worktree?"
          description={
            <>
              <p>Are you sure you want to delete worktree "{worktree.name}"?</p>
              {sessions.length > 0 && (
                <p style={{ color: '#ff4d4f' }}>
                  ⚠️ {sessions.length} session(s) reference this worktree.
                </p>
              )}
            </>
          }
          onConfirm={handleDelete}
          okText="Delete"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />}>
            Delete Worktree
          </Button>
        </Popconfirm>
        {/* TODO: Add "Open in Terminal" button once terminal integration is ready */}
      </Space>
    </Space>
  );
};
