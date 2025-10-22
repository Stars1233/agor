import { DeleteOutlined, EditOutlined, PlusOutlined, SmileOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Popconfirm, Popover, Space, Table, Typography } from 'antd';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import { useState } from 'react';
import type { Board } from '@agor/core/types';
import { JSONEditor, validateJSON } from '../JSONEditor';

const { Text } = Typography;

interface BoardsTableProps {
  boards: Board[];
  onCreate?: (board: Partial<Board>) => void;
  onUpdate?: (boardId: string, updates: Partial<Board>) => void;
  onDelete?: (boardId: string) => void;
}

export const BoardsTable: React.FC<BoardsTableProps> = ({
  boards,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [form] = Form.useForm();

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    form.setFieldValue('icon', emojiData.emoji);
    setEmojiPickerOpen(false);
  };

  const handleCreate = () => {
    form.validateFields().then(values => {
      onCreate?.({
        name: values.name,
        icon: values.icon || '📋',
        description: values.description,
        sessions: [],
        custom_context: values.custom_context ? JSON.parse(values.custom_context) : undefined,
      });
      form.resetFields();
      setCreateModalOpen(false);
    });
  };

  const handleEdit = (board: Board) => {
    setEditingBoard(board);
    form.setFieldsValue({
      name: board.name,
      icon: board.icon,
      description: board.description,
      custom_context: board.custom_context ? JSON.stringify(board.custom_context, null, 2) : '',
    });
    setEditModalOpen(true);
  };

  const handleUpdate = () => {
    if (!editingBoard) return;

    form.validateFields().then(values => {
      onUpdate?.(editingBoard.board_id, {
        name: values.name,
        icon: values.icon,
        description: values.description,
        custom_context: values.custom_context ? JSON.parse(values.custom_context) : undefined,
      });
      form.resetFields();
      setEditModalOpen(false);
      setEditingBoard(null);
    });
  };

  const handleDelete = (boardId: string) => {
    onDelete?.(boardId);
  };

  const columns = [
    {
      title: 'Icon',
      dataIndex: 'icon',
      key: 'icon',
      width: 80,
      render: (icon: string) => <span style={{ fontSize: 24 }}>{icon || '📋'}</span>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => <Text type="secondary">{desc || '—'}</Text>,
    },
    {
      title: 'Sessions',
      dataIndex: 'sessions',
      key: 'sessions',
      width: 100,
      render: (sessions: string[]) => sessions.length,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, board: Board) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(board)}
          />
          <Popconfirm
            title="Delete board?"
            description={`Are you sure you want to delete "${board.name}"? Sessions will not be deleted.`}
            onConfirm={() => handleDelete(board.board_id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
          New Board
        </Button>
      </div>

      <Table
        dataSource={boards}
        columns={columns}
        rowKey="board_id"
        pagination={false}
        size="small"
      />

      {/* Create Board Modal */}
      <Modal
        title="Create Board"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => {
          form.resetFields();
          setCreateModalOpen(false);
        }}
        okText="Create"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Please enter a board name' }]}
          >
            <Input placeholder="My Board" />
          </Form.Item>

          <Form.Item label="Icon" name="icon" style={{ marginBottom: 24 }}>
            <Input.Group compact style={{ display: 'flex' }}>
              <Form.Item noStyle shouldUpdate>
                {() => (
                  <Input
                    prefix={
                      <span style={{ fontSize: 20 }}>{form.getFieldValue('icon') || '📋'}</span>
                    }
                    readOnly
                    style={{ cursor: 'default', flex: 1 }}
                  />
                )}
              </Form.Item>
              <Popover
                content={
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme={Theme.DARK}
                    width={350}
                    height={400}
                  />
                }
                trigger="click"
                open={emojiPickerOpen}
                onOpenChange={setEmojiPickerOpen}
                placement="right"
              >
                <Button icon={<SmileOutlined />} style={{ height: '32px' }}>
                  Pick Emoji
                </Button>
              </Popover>
            </Input.Group>
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Optional description..." rows={3} />
          </Form.Item>

          <Form.Item
            label="Custom Context (JSON)"
            name="custom_context"
            help="Add custom fields for use in zone trigger templates (e.g., {{ board.context.yourField }})"
            rules={[{ validator: validateJSON }]}
          >
            <JSONEditor placeholder='{"team": "Backend", "sprint": 42}' rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Board Modal */}
      <Modal
        title="Edit Board"
        open={editModalOpen}
        onOk={handleUpdate}
        onCancel={() => {
          form.resetFields();
          setEditModalOpen(false);
          setEditingBoard(null);
        }}
        okText="Save"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Please enter a board name' }]}
          >
            <Input placeholder="My Board" />
          </Form.Item>

          <Form.Item label="Icon" name="icon" style={{ marginBottom: 24 }}>
            <Input.Group compact style={{ display: 'flex' }}>
              <Form.Item noStyle shouldUpdate>
                {() => (
                  <Input
                    prefix={
                      <span style={{ fontSize: 20 }}>{form.getFieldValue('icon') || '📋'}</span>
                    }
                    readOnly
                    style={{ cursor: 'default', flex: 1 }}
                  />
                )}
              </Form.Item>
              <Popover
                content={
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme={Theme.DARK}
                    width={350}
                    height={400}
                  />
                }
                trigger="click"
                open={emojiPickerOpen}
                onOpenChange={setEmojiPickerOpen}
                placement="right"
              >
                <Button icon={<SmileOutlined />} style={{ height: '32px' }}>
                  Pick Emoji
                </Button>
              </Popover>
            </Input.Group>
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Optional description..." rows={3} />
          </Form.Item>

          <Form.Item
            label="Custom Context (JSON)"
            name="custom_context"
            help="Add custom fields for use in zone trigger templates (e.g., {{ board.context.yourField }})"
            rules={[{ validator: validateJSON }]}
          >
            <JSONEditor placeholder='{"team": "Backend", "sprint": 42}' rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
