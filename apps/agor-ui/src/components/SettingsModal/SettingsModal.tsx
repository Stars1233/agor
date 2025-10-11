import type { Board, CreateUserInput, Repo, UpdateUserInput, User } from '@agor/core/types';
import { Modal, Tabs } from 'antd';
import { BoardsTable } from './BoardsTable';
import { ReposTable } from './ReposTable';
import { UsersTable } from './UsersTable';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  boards: Board[];
  repos: Repo[];
  users: User[];
  onCreateBoard?: (board: Partial<Board>) => void;
  onUpdateBoard?: (boardId: string, updates: Partial<Board>) => void;
  onDeleteBoard?: (boardId: string) => void;
  onCreateRepo?: (data: { url: string; slug: string }) => void;
  onDeleteRepo?: (repoId: string) => void;
  onDeleteWorktree?: (repoId: string, worktreeName: string) => void;
  onCreateWorktree?: (
    repoId: string,
    data: { name: string; ref: string; createBranch: boolean }
  ) => void;
  onCreateUser?: (data: CreateUserInput) => void;
  onUpdateUser?: (userId: string, updates: UpdateUserInput) => void;
  onDeleteUser?: (userId: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  boards,
  repos,
  users,
  onCreateBoard,
  onUpdateBoard,
  onDeleteBoard,
  onCreateRepo,
  onDeleteRepo,
  onDeleteWorktree,
  onCreateWorktree,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  return (
    <Modal
      title="Settings"
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      styles={{
        body: { padding: '24px 0' },
      }}
    >
      <Tabs
        defaultActiveKey="boards"
        items={[
          {
            key: 'boards',
            label: 'Boards',
            children: (
              <BoardsTable
                boards={boards}
                onCreate={onCreateBoard}
                onUpdate={onUpdateBoard}
                onDelete={onDeleteBoard}
              />
            ),
          },
          {
            key: 'repos',
            label: 'Repositories',
            children: (
              <ReposTable
                repos={repos}
                onCreate={onCreateRepo}
                onDelete={onDeleteRepo}
                onDeleteWorktree={onDeleteWorktree}
                onCreateWorktree={onCreateWorktree}
              />
            ),
          },
          {
            key: 'users',
            label: 'Users',
            children: (
              <UsersTable
                users={users}
                onCreate={onCreateUser}
                onUpdate={onUpdateUser}
                onDelete={onDeleteUser}
              />
            ),
          },
        ]}
      />
    </Modal>
  );
};
