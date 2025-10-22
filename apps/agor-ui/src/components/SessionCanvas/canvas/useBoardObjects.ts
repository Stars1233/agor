/**
 * Hook for managing board objects (text labels, zones, etc.)
 */

import type { AgorClient } from '@agor/core/api';
import { useCallback, useRef } from 'react';
import type { Node } from 'reactflow';
import type { Board, BoardObject } from '@agor/core/types';

interface UseBoardObjectsProps {
  board: Board | null;
  client: AgorClient | null;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  deletedObjectsRef: React.MutableRefObject<Set<string>>;
  eraserMode?: boolean;
}

export const useBoardObjects = ({
  board,
  client,
  setNodes,
  deletedObjectsRef,
  eraserMode = false,
}: UseBoardObjectsProps) => {
  // Use ref to avoid recreating callbacks when board changes
  const boardRef = useRef(board);
  boardRef.current = board;

  /**
   * Update an existing board object
   */
  const handleUpdateObject = useCallback(
    async (objectId: string, objectData: BoardObject) => {
      const currentBoard = boardRef.current;
      if (!currentBoard || !client) return;

      try {
        await client.service('boards').patch(currentBoard.board_id, {
          _action: 'upsertObject',
          objectId,
          objectData,
          // biome-ignore lint/suspicious/noExplicitAny: Board patch with custom _action field
        } as any);
      } catch (error) {
        console.error('Failed to update object:', error);
      }
    },
    [client] // Only depend on client, not board
  );

  /**
   * Delete a zone with session cleanup options
   */
  const deleteZone = useCallback(
    async (objectId: string, deleteAssociatedSessions: boolean) => {
      if (!board || !client) return;

      // Mark as deleted to prevent re-appearance during WebSocket updates
      deletedObjectsRef.current.add(objectId);

      // Find sessions that will be affected (pinned sessions via parentId)
      const zoneObject = board.objects?.[objectId];
      if (!zoneObject || zoneObject.type !== 'zone') return;

      // Find affected sessions (those pinned to this zone)
      const affectedSessionIds: string[] = [];
      for (const sessionId of board.sessions) {
        const position = board.layout?.[sessionId];
        if (position?.parentId === objectId) {
          affectedSessionIds.push(sessionId);
        }
      }

      // Optimistic removal of zone
      setNodes(nodes => {
        let updatedNodes = nodes.filter(n => n.id !== objectId);

        // If deleting associated sessions, remove them too
        if (deleteAssociatedSessions) {
          updatedNodes = updatedNodes.filter(n => !affectedSessionIds.includes(n.id));
        }

        return updatedNodes;
      });

      try {
        await client.service('boards').patch(board.board_id, {
          _action: 'deleteZone',
          objectId,
          deleteAssociatedSessions,
          // biome-ignore lint/suspicious/noExplicitAny: Board patch with custom _action field
        } as any);

        // After successful deletion, we can remove from the tracking set
        setTimeout(() => {
          deletedObjectsRef.current.delete(objectId);
        }, 1000);
      } catch (error) {
        console.error('Failed to delete zone:', error);
        // Rollback: remove from deleted set
        deletedObjectsRef.current.delete(objectId);
        // Note: WebSocket update should restore the actual state
      }
    },
    [board, client, setNodes, deletedObjectsRef]
  );

  /**
   * Convert board.objects to React Flow nodes
   */
  const getBoardObjectNodes = useCallback((): Node[] => {
    if (!board?.objects) return [];

    return Object.entries(board.objects)
      .filter(([, objectData]) => {
        // Filter out objects with invalid positions (prevents NaN errors in React Flow)
        const hasValidPosition =
          typeof objectData.x === 'number' &&
          typeof objectData.y === 'number' &&
          !Number.isNaN(objectData.x) &&
          !Number.isNaN(objectData.y);

        if (!hasValidPosition) {
          console.warn(`Skipping board object with invalid position:`, objectData);
        }

        return hasValidPosition;
      })
      .map(([objectId, objectData]) => {
        // Calculate session count for this zone (count pinned sessions via parentId)
        let sessionCount = 0;
        if (objectData.type === 'zone') {
          for (const sessionId of board.sessions) {
            const position = board.layout?.[sessionId];
            if (position?.parentId === objectId) {
              sessionCount++;
            }
          }
        }

        // Zone node
        return {
          id: objectId,
          type: 'zone',
          position: { x: objectData.x, y: objectData.y },
          draggable: true,
          className: eraserMode ? 'eraser-mode' : undefined,
          style: {
            width: objectData.width,
            height: objectData.height,
            zIndex: -1, // Zones behind everything
          },
          data: {
            objectId,
            label: objectData.type === 'zone' ? objectData.label : '',
            width: objectData.width,
            height: objectData.height,
            color: objectData.color,
            status: objectData.type === 'zone' ? objectData.status : undefined,
            x: objectData.x, // Include position in data for updates
            y: objectData.y,
            trigger: objectData.type === 'zone' ? objectData.trigger : undefined,
            sessionCount,
            onUpdate: handleUpdateObject,
            onDelete: deleteZone,
          },
        };
      });
  }, [board?.objects, board?.sessions, board?.layout, handleUpdateObject, deleteZone, eraserMode]);

  /**
   * Add a zone node at the specified position
   */
  const addZoneNode = useCallback(
    async (x: number, y: number) => {
      const currentBoard = boardRef.current;
      if (!currentBoard || !client) return;

      const objectId = `zone-${Date.now()}`;
      const width = 400;
      const height = 600;

      // Optimistic update
      setNodes(nodes => [
        ...nodes,
        {
          id: objectId,
          type: 'zone',
          position: { x, y },
          draggable: true,
          style: {
            width,
            height,
            zIndex: -1,
          },
          data: {
            objectId,
            label: 'New Zone',
            width,
            height,
            color: undefined, // Will use theme default (colorBorder)
            onUpdate: handleUpdateObject,
          },
        },
      ]);

      // Persist atomically
      try {
        await client.service('boards').patch(currentBoard.board_id, {
          _action: 'upsertObject',
          objectId,
          objectData: {
            type: 'zone',
            x,
            y,
            width,
            height,
            label: 'New Zone',
            // No color specified - will use theme default
          },
          // biome-ignore lint/suspicious/noExplicitAny: Board patch with custom _action field
        } as any);
      } catch (error) {
        console.error('Failed to add zone node:', error);
        // Rollback
        setNodes(nodes => nodes.filter(n => n.id !== objectId));
      }
    },
    [client, setNodes, handleUpdateObject] // Removed board dependency
  );

  /**
   * Delete a board object
   */
  const deleteObject = useCallback(
    async (objectId: string) => {
      const currentBoard = boardRef.current;
      if (!currentBoard || !client) return;

      // Mark as deleted to prevent re-appearance during WebSocket updates
      deletedObjectsRef.current.add(objectId);

      // Optimistic removal
      setNodes(nodes => nodes.filter(n => n.id !== objectId));

      try {
        await client.service('boards').patch(currentBoard.board_id, {
          _action: 'removeObject',
          objectId,
          // biome-ignore lint/suspicious/noExplicitAny: Board patch with custom _action field
        } as any);

        // After successful deletion, we can remove from the tracking set
        // (the object will no longer exist in board.objects)
        setTimeout(() => {
          deletedObjectsRef.current.delete(objectId);
        }, 1000);
      } catch (error) {
        console.error('Failed to delete object:', error);
        // Rollback: remove from deleted set
        deletedObjectsRef.current.delete(objectId);
      }
    },
    [client, setNodes, deletedObjectsRef] // Removed board dependency
  );

  /**
   * Batch update positions for board objects after drag
   */
  const batchUpdateObjectPositions = useCallback(
    async (updates: Record<string, { x: number; y: number }>) => {
      const currentBoard = boardRef.current;
      if (!currentBoard || !client || Object.keys(updates).length === 0) return;

      try {
        // Build objects payload with full object data + new positions
        const objects: Record<string, BoardObject> = {};

        for (const [objectId, position] of Object.entries(updates)) {
          // Skip objects that have been deleted locally
          if (deletedObjectsRef.current.has(objectId)) {
            continue;
          }

          const existingObject = currentBoard.objects?.[objectId];
          if (!existingObject) continue;

          objects[objectId] = {
            ...existingObject,
            x: position.x,
            y: position.y,
          };
        }

        if (Object.keys(objects).length === 0) {
          return;
        }

        await client.service('boards').patch(currentBoard.board_id, {
          _action: 'batchUpsertObjects',
          objects,
          // biome-ignore lint/suspicious/noExplicitAny: Board patch with custom _action field
        } as any);
      } catch (error) {
        console.error('Failed to persist object positions:', error);
      }
    },
    [client, deletedObjectsRef] // Removed board dependency
  );

  return {
    getBoardObjectNodes,
    addZoneNode,
    deleteObject,
    deleteZone,
    batchUpdateObjectPositions,
  };
};
