/**
 * Session Metadata Form
 *
 * Reusable form section for session metadata fields:
 * - Title
 * - Issue URL
 * - Pull Request URL
 * - Custom Context (JSON)
 *
 * Used in both NewSessionModal and SessionSettingsModal
 */

import { Form, Input } from 'antd';
import { JSONEditor, validateJSON } from '../JSONEditor';

export interface SessionMetadataFormProps {
  /** Whether to show help text under each field */
  showHelpText?: boolean;
  /** Whether to show the title field as required */
  titleRequired?: boolean;
  /** Custom label for title field (e.g., "Session Title" vs "Title") */
  titleLabel?: string;
}

/**
 * Form fields for session metadata
 *
 * Expects to be used within a Form context with these field names:
 * - title
 * - issue_url
 * - pull_request_url
 * - custom_context
 */
export const SessionMetadataForm: React.FC<SessionMetadataFormProps> = ({
  showHelpText = true,
  titleRequired = false,
  titleLabel = 'Session Title',
}) => {
  return (
    <>
      <Form.Item
        name="title"
        label={titleLabel}
        rules={[{ required: titleRequired, message: 'Please enter a session title' }]}
        help={
          showHelpText && !titleRequired ? 'A short descriptive name for this session' : undefined
        }
      >
        <Input placeholder="e.g., Auth System Implementation" />
      </Form.Item>

      <Form.Item
        name="issue_url"
        label="Issue URL"
        rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
        help={showHelpText ? 'Link to related GitHub/GitLab issue' : undefined}
      >
        <Input placeholder="https://github.com/org/repo/issues/123" />
      </Form.Item>

      <Form.Item
        name="pull_request_url"
        label="Pull Request URL"
        rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
        help={showHelpText ? 'Link to related pull request' : undefined}
      >
        <Input placeholder="https://github.com/org/repo/pull/456" />
      </Form.Item>

      <Form.Item
        name="custom_context"
        label="Custom Context (JSON)"
        help={
          showHelpText
            ? 'Add custom fields for use in zone trigger templates (e.g., {{ session.context.yourField }})'
            : undefined
        }
        rules={[{ validator: validateJSON }]}
      >
        <JSONEditor placeholder='{"teamName": "Backend", "sprintNumber": 42}' rows={4} />
      </Form.Item>
    </>
  );
};
