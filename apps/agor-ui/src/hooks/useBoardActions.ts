/**
 * React hook for board CRUD operations
 */

import type { AgorClient } from '@agor/core/api';
import { message } from 'antd';
import { useState } from 'react';
import type { Board, UUID } from '@agor/core/types';

interface UseBoardActionsResult {
  createBoard: (board: Partial<Board>) => Promise<Board | null>;
  updateBoard: (boardId: UUID, updates: Partial<Board>) => Promise<Board | null>;
  deleteBoard: (boardId: UUID) => Promise<boolean>;
  loading: boolean;
}

export function useBoardActions(client: AgorClient | null): UseBoardActionsResult {
  const [loading, setLoading] = useState(false);

  const createBoard = async (board: Partial<Board>): Promise<Board | null> => {
    if (!client) return null;

    try {
      setLoading(true);
      const created = await client.service('boards').create(board);
      return created as Board;
    } catch (error) {
      message.error(
        `Failed to create board: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateBoard = async (boardId: UUID, updates: Partial<Board>): Promise<Board | null> => {
    if (!client) return null;

    try {
      setLoading(true);
      const updated = await client.service('boards').patch(boardId, updates);
      return updated as Board;
    } catch (error) {
      message.error(
        `Failed to update board: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteBoard = async (boardId: UUID): Promise<boolean> => {
    if (!client) return false;

    try {
      setLoading(true);
      await client.service('boards').remove(boardId);
      return true;
    } catch (error) {
      message.error(
        `Failed to delete board: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    createBoard,
    updateBoard,
    deleteBoard,
    loading,
  };
}
