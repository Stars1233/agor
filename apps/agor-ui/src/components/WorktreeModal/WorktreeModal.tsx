import type { AgorClient } from '@agor/core/api';
import type { Repo, Session, Worktree } from '@agor/core/types';
import { Modal, Tabs } from 'antd';
import { useState } from 'react';
import { ConceptsTab } from './tabs/ConceptsTab';
import { EnvironmentTab } from './tabs/EnvironmentTab';
import { GeneralTab } from './tabs/GeneralTab';

export interface WorktreeModalProps {
  open: boolean;
  onClose: () => void;
  worktree: Worktree | null;
  repo: Repo | null;
  sessions: Session[];
  client: AgorClient | null;
  onUpdateWorktree?: (worktreeId: string, updates: Partial<Worktree>) => void;
  onUpdateRepo?: (repoId: string, updates: Partial<Repo>) => void;
  onDelete?: (worktreeId: string) => void;
  onOpenSettings?: () => void; // Navigate to Settings → Repositories
}

export const WorktreeModal: React.FC<WorktreeModalProps> = ({
  open,
  onClose,
  worktree,
  repo,
  sessions,
  client,
  onUpdateWorktree,
  onUpdateRepo,
  onDelete,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState('general');

  if (!worktree || !repo) {
    return null;
  }

  return (
    <Modal
      title={`Worktree: ${worktree.name}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={1200}
      styles={{
        body: { padding: '24px 0', overflow: 'hidden' },
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'general',
            label: 'General',
            children: (
              <GeneralTab
                worktree={worktree}
                repo={repo}
                sessions={sessions}
                onUpdate={onUpdateWorktree}
                onDelete={onDelete}
              />
            ),
          },
          {
            key: 'environment',
            label: 'Environment',
            children: (
              <EnvironmentTab
                worktree={worktree}
                repo={repo}
                client={client}
                onUpdateRepo={onUpdateRepo}
                onUpdateWorktree={onUpdateWorktree}
              />
            ),
          },
          {
            key: 'concepts',
            label: 'Concepts',
            children: <ConceptsTab worktree={worktree} client={client} />,
          },
        ]}
      />
    </Modal>
  );
};
