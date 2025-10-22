// @ts-nocheck - ConceptsTab has type errors, will be refactored
import type { AgorClient } from '@agor/core/api';
import type { ContextFileDetail, ContextFileListItem, Worktree } from '@agor/core/types';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Alert, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { MarkdownFileCollection } from '../../MarkdownFileCollection/MarkdownFileCollection';
import { MarkdownModal } from '../../MarkdownModal/MarkdownModal';

const { Text } = Typography;

interface ConceptsTabProps {
  worktree: Worktree;
  client: AgorClient | null;
}

export const ConceptsTab: React.FC<ConceptsTabProps> = ({ worktree, client }) => {
  const [files, setFiles] = useState<ContextFileListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedFile, setSelectedFile] = useState<ContextFileDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [_loadingDetail, setLoadingDetail] = useState(false);

  // Fetch concept files when tab is opened
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }

    const fetchFiles = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await client.service('context').find({
          query: { worktree_id: worktree.worktree_id },
        });
        const data = Array.isArray(result) ? result : result.data;

        setFiles(data);
      } catch (err) {
        console.error('Failed to fetch concept files:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [client, worktree.worktree_id]);

  // Handle file click - fetch full content
  const handleFileClick = async (file: ContextFileListItem) => {
    if (!client) return;

    try {
      setLoadingDetail(true);
      setModalOpen(true);

      // Fetch full file detail with content
      const detail = await client.service('context').get(file.path, {
        query: { worktree_id: worktree.worktree_id },
      });

      setSelectedFile(detail);
    } catch (err) {
      console.error('Failed to fetch file detail:', err);
      setError(err instanceof Error ? err.message : String(err));
      setModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedFile(null);
  };

  return (
    <div style={{ width: '100%', padding: '0 24px', maxHeight: '70vh', overflowY: 'auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message={
            <Text style={{ fontSize: 12 }}>
              Agor looks for markdown files in{' '}
              <Text code style={{ fontSize: 11 }}>
                {'{REPO}'}/context/
              </Text>
            </Text>
          }
          type="info"
          showIcon
          style={{ padding: '8px 12px' }}
        />

        {error && <Alert message="Error" description={error} type="error" showIcon />}

        <MarkdownFileCollection
          files={files}
          loading={loading}
          onFileClick={handleFileClick}
          emptyMessage="No concept files found in context/ directory"
        />

        {selectedFile && (
          <MarkdownModal
            open={modalOpen}
            title={selectedFile.title}
            content={selectedFile.content}
            filePath={selectedFile.path.replace(/^context\//, '')}
            onClose={handleModalClose}
          />
        )}

        {/* TODO: Phase 4 - Add "Create New Concept File" button */}
        {/* TODO: Phase 4 - Implement markdown editor for editing files */}
      </Space>
    </div>
  );
};
