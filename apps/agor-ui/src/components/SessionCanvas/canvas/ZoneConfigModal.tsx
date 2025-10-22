/**
 * Modal for configuring zone settings (name, triggers, etc.)
 */

import { Alert, Input, Modal, Select, theme } from 'antd';
import { useEffect, useId, useState } from 'react';
import type { BoardObject, ZoneTriggerType } from '@agor/core/types';

interface ZoneConfigModalProps {
  open: boolean;
  onCancel: () => void;
  zoneName: string;
  objectId: string;
  onUpdate: (objectId: string, objectData: BoardObject) => void;
  zoneData: BoardObject;
}

export const ZoneConfigModal = ({
  open,
  onCancel,
  zoneName,
  objectId,
  onUpdate,
  zoneData,
}: ZoneConfigModalProps) => {
  const { token } = theme.useToken();
  const [name, setName] = useState(zoneName);
  const [triggerType, setTriggerType] = useState<ZoneTriggerType>('prompt');
  const [triggerText, setTriggerText] = useState('');
  const nameId = useId();
  const triggerTypeId = useId();
  const triggerTextId = useId();

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName(zoneName);
      // Load existing trigger data if available
      if (zoneData.type === 'zone' && zoneData.trigger) {
        setTriggerType(zoneData.trigger.type);
        setTriggerText(zoneData.trigger.text);
      } else {
        setTriggerType('prompt');
        setTriggerText('');
      }
    }
  }, [open, zoneName, zoneData]);

  const handleSave = () => {
    if (zoneData.type === 'zone') {
      const hasChanges =
        name !== zoneName ||
        triggerText.trim() !== (zoneData.trigger?.text || '') ||
        triggerType !== (zoneData.trigger?.type || 'prompt');

      if (hasChanges) {
        onUpdate(objectId, {
          ...zoneData,
          label: name,
          // Only save trigger if text is provided
          trigger: triggerText.trim()
            ? {
                type: triggerType,
                text: triggerText.trim(),
              }
            : undefined, // Remove trigger if text is empty
        });
      }
    }
    onCancel();
  };

  return (
    <Modal
      title="Configure Zone"
      open={open}
      onCancel={onCancel}
      onOk={handleSave}
      okText="Save"
      cancelText="Cancel"
      width={600}
    >
      {/* Zone Name */}
      <div style={{ marginBottom: 24 }}>
        <label
          htmlFor={nameId}
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: token.colorText,
          }}
        >
          Zone Name
        </label>
        <Input
          id={nameId}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter zone name..."
          size="large"
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor={triggerTypeId}
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: token.colorText,
          }}
        >
          Trigger Type
        </label>
        <Select
          id={triggerTypeId}
          value={triggerType}
          onChange={setTriggerType}
          style={{ width: '100%' }}
          options={[
            { value: 'prompt', label: 'Prompt - Send a message to the session' },
            { value: 'task', label: 'Task - Create a new task' },
            { value: 'subtask', label: 'Subtask - Create a subtask for the session' },
          ]}
        />
      </div>

      <div>
        <label
          htmlFor={triggerTextId}
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: token.colorText,
          }}
        >
          Trigger
        </label>
        <Input.TextArea
          id={triggerTextId}
          value={triggerText}
          onChange={e => setTriggerText(e.target.value)}
          placeholder="Enter the prompt or task description that will be triggered..."
          rows={6}
        />
        <Alert
          message="Handlebars Template Support"
          description={
            <div>
              <p style={{ marginBottom: 8 }}>
                Use Handlebars syntax to reference session and board data in your trigger:
              </p>
              <ul style={{ marginLeft: 16, marginBottom: 8 }}>
                <li>
                  <code>{'{{ worktree.issue_url }}'}</code> - GitHub issue URL
                </li>
                <li>
                  <code>{'{{ worktree.pull_request_url }}'}</code> - Pull request URL
                </li>
                <li>
                  <code>{'{{ worktree.notes }}'}</code> - Worktree notes
                </li>
                <li>
                  <code>{'{{ session.description }}'}</code> - Session description
                </li>
                <li>
                  <code>{'{{ session.context.* }}'}</code> - Custom context from session settings
                </li>
                <li>
                  <code>{'{{ board.name }}'}</code> - Board name
                </li>
                <li>
                  <code>{'{{ board.description }}'}</code> - Board description
                </li>
                <li>
                  <code>{'{{ board.context.* }}'}</code> - Custom context from board settings
                </li>
              </ul>
              <p style={{ marginTop: 8, marginBottom: 0 }}>
                Example:{' '}
                <code>
                  {
                    'Review {{ worktree.issue_url }} for {{ board.context.team }} sprint {{ board.context.sprint }}'
                  }
                </code>
              </p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginTop: 12 }}
        />
      </div>
    </Modal>
  );
};
