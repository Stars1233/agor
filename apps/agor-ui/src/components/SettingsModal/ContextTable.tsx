/**
 * ContextTable - Settings tab for browsing context folder files
 *
 * Integrates with daemon /context service to list and view markdown files
 * Uses reusable MarkdownFileCollection + MarkdownModal components
 */

import type { AgorClient } from '@agor/core/api';
import { Alert } from 'antd';
import { useEffect, useState } from 'react';
import type { ContextFileDetail, ContextFileListItem } from '@agor/core/types';
import { MarkdownFileCollection } from '../MarkdownFileCollection/MarkdownFileCollection';
import { MarkdownModal } from '../MarkdownModal/MarkdownModal';

export interface ContextTableProps {
  /** FeathersJS client for fetching context files */
  client: AgorClient | null;
}

export const ContextTable: React.FC<ContextTableProps> = ({ client }) => {
  const [files, setFiles] = useState<ContextFileListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedFile, setSelectedFile] = useState<ContextFileDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Fetch context files on mount
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }

    const fetchFiles = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await client.service('context').find();
        const data = Array.isArray(result) ? result : result.data;

        setFiles(data);
      } catch (err) {
        console.error('Failed to fetch context files:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [client]);

  // Handle file click - fetch full content
  const handleFileClick = async (file: ContextFileListItem) => {
    if (!client) return;

    try {
      setLoadingDetail(true);
      setModalOpen(true);

      // Fetch full file detail with content
      const detail = await client.service('context').get(file.path);

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

  if (error) {
    return (
      <div style={{ padding: '0 24px' }}>
        <Alert
          type="error"
          message="Failed to load context files"
          description={error}
          showIcon
          closable
          onClose={() => setError(null)}
        />
      </div>
    );
  }

  return (
    <>
      <MarkdownFileCollection
        files={files}
        onFileClick={handleFileClick}
        loading={loading}
        emptyMessage="No markdown files found in context/"
      />

      {selectedFile && (
        <MarkdownModal
          open={modalOpen}
          onClose={handleModalClose}
          title={selectedFile.title}
          content={loadingDetail ? 'Loading...' : selectedFile.content}
          filePath={selectedFile.path}
        />
      )}
    </>
  );
};
