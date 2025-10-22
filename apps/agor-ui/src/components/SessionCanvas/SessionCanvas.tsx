import type { AgorClient } from '@agor/core/api';
import { BorderOutlined, DeleteOutlined, SelectOutlined } from '@ant-design/icons';
import { Modal, Typography } from 'antd';
import Handlebars from 'handlebars';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ControlButton,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  type NodeDragHandler,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import type { BoardID, MCPServer, User, ZoneTrigger } from '@agor/core/types';
import 'reactflow/dist/style.css';
import './SessionCanvas.css';
import { useCursorTracking } from '../../hooks/useCursorTracking';
import { usePresence } from '../../hooks/usePresence';
import type { Board, BoardObject, Session, Task } from '@agor/core/types';
import SessionCard from '../SessionCard';
import { ZoneNode } from './canvas/BoardObjectNodes';
import { CursorNode } from './canvas/CursorNode';
import { useBoardObjects } from './canvas/useBoardObjects';

const { Text, Paragraph } = Typography;

interface SessionCanvasProps {
  board: Board | null;
  client: AgorClient | null;
  sessions: Session[];
  tasks: Record<string, Task[]>;
  users: User[];
  worktrees: import('@agor/core/types').Worktree[];
  currentUserId?: string;
  mcpServers?: MCPServer[];
  sessionMcpServerIds?: Record<string, string[]>; // Map sessionId -> mcpServerIds[]
  onSessionClick?: (sessionId: string) => void;
  onTaskClick?: (taskId: string) => void;
  onSessionUpdate?: (sessionId: string, updates: Partial<Session>) => void;
  onSessionDelete?: (sessionId: string) => void;
  onUpdateSessionMcpServers?: (sessionId: string, mcpServerIds: string[]) => void;
  onOpenSettings?: (sessionId: string) => void;
}

interface SessionNodeData {
  session: Session;
  tasks: Task[];
  users: User[];
  currentUserId?: string;
  onTaskClick?: (taskId: string) => void;
  onSessionClick?: () => void;
  onDelete?: (sessionId: string) => void;
  onOpenSettings?: (sessionId: string) => void;
  onUnpin?: (sessionId: string) => void;
  compact?: boolean;
  isPinned?: boolean;
  parentZoneId?: string;
  zoneName?: string;
  zoneColor?: string;
}

// Custom node component that renders SessionCard
const SessionNode = ({ data }: { data: SessionNodeData }) => {
  return (
    <div className="session-node">
      <SessionCard
        session={data.session}
        tasks={data.tasks}
        users={data.users}
        currentUserId={data.currentUserId}
        onTaskClick={data.onTaskClick}
        onSessionClick={data.onSessionClick}
        onDelete={data.onDelete}
        onOpenSettings={data.onOpenSettings}
        onUnpin={data.onUnpin}
        isPinned={data.isPinned}
        zoneName={data.zoneName}
        zoneColor={data.zoneColor}
        defaultExpanded={!data.compact}
      />
    </div>
  );
};

// Define nodeTypes outside component to avoid recreation on every render
const nodeTypes = {
  sessionNode: SessionNode,
  zone: ZoneNode,
  cursor: CursorNode,
};

const SessionCanvas = ({
  board,
  client,
  sessions,
  worktrees,
  tasks,
  users,
  currentUserId,
  mcpServers = [],
  sessionMcpServerIds = {},
  onSessionClick,
  onTaskClick,
  onSessionUpdate,
  onSessionDelete,
  onUpdateSessionMcpServers,
  onOpenSettings,
}: SessionCanvasProps) => {
  // Tool state for canvas annotations
  const [activeTool, setActiveTool] = useState<'select' | 'zone' | 'eraser'>('select');

  // Zone drawing state (drag-to-draw)
  const [drawingZone, setDrawingZone] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);

  // Trigger confirmation modal state
  const [triggerModal, setTriggerModal] = useState<{
    sessionId: string;
    zoneName: string;
    trigger: ZoneTrigger;
    pinData: { x: number; y: number; parentId: string };
  } | null>(null);

  // Debounce timer ref for position updates
  const layoutUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingLayoutUpdatesRef = useRef<Record<string, { x: number; y: number }>>({});
  const isDraggingRef = useRef(false);
  // Track positions we've explicitly set (to avoid being overwritten by other clients)
  const localPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  // Track objects we've deleted locally (to prevent them from reappearing during WebSocket updates)
  const deletedObjectsRef = useRef<Set<string>>(new Set());

  // Initialize nodes and edges state BEFORE using them
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Track resize state
  const resizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingResizeUpdatesRef = useRef<Record<string, { width: number; height: number }>>({});

  // Board objects hook
  const { getBoardObjectNodes, addZoneNode, deleteObject, batchUpdateObjectPositions } =
    useBoardObjects({
      board,
      client,
      setNodes,
      deletedObjectsRef,
      eraserMode: activeTool === 'eraser',
    });

  // Memoize board layout to prevent unnecessary re-renders
  // Layout changes when actual layout data changes, not just board object reference
  const boardLayout = useMemo(() => board?.layout, [board?.layout]);

  // Extract zone labels - memoized to only change when labels actually change
  const zoneLabels = useMemo(() => {
    if (!board?.objects) return {};
    const labels: Record<string, string> = {};
    Object.entries(board.objects).forEach(([id, obj]) => {
      if (obj.type === 'zone') {
        labels[id] = obj.label;
      }
    });
    return labels;
  }, [board?.objects]);

  // Handler to unpin a session from its zone
  const handleUnpin = useCallback(
    async (sessionId: string) => {
      if (!board || !client) return;

      const currentLayout = board.layout?.[sessionId];
      if (!currentLayout?.parentId) return;

      // Get session position from board.layout
      const sessionLayout = board.layout?.[sessionId];
      // Get parent zone position from board.objects (zones are board objects, not in layout)
      const parentZone = board.objects?.[currentLayout.parentId];

      if (!sessionLayout || !parentZone) {
        console.error('Cannot unpin: missing layout data', {
          sessionLayout: !!sessionLayout,
          parentZone: !!parentZone,
          parentId: currentLayout.parentId,
        });
        return;
      }

      // Calculate absolute position from relative position
      // Session's layout position is relative to parent zone, so add zone's position
      const absoluteX = sessionLayout.x + parentZone.x;
      const absoluteY = sessionLayout.y + parentZone.y;

      // Update layout without parentId
      const newLayout = {
        ...board.layout,
        [sessionId]: {
          x: absoluteX,
          y: absoluteY,
          parentId: undefined,
        },
      };

      await client.service('boards').patch(board.board_id, {
        layout: newLayout,
      });

      console.log(`📍 Manually unpinned session ${sessionId.substring(0, 8)}`);
    },
    [board, client]
  );

  // Convert sessions to React Flow nodes
  const initialNodes: Node[] = useMemo(() => {
    // Simple layout algorithm: place nodes vertically with offset for children
    const nodeMap = new Map<string, { x: number; y: number; level: number }>();
    let currentY = 0;
    const VERTICAL_SPACING = 450;
    const HORIZONTAL_SPACING = 500;

    // First pass: identify root sessions (no parent, no forked_from)
    const rootSessions = sessions.filter(
      s => !s.genealogy.parent_session_id && !s.genealogy.forked_from_session_id
    );

    // Recursive function to layout session and its children
    const layoutSession = (session: Session, level: number, offsetX: number) => {
      nodeMap.set(session.session_id, { x: offsetX, y: currentY, level });
      currentY += VERTICAL_SPACING;

      // Layout children (both spawned and forked)
      const children = sessions.filter(
        s =>
          s.genealogy.parent_session_id === session.session_id ||
          s.genealogy.forked_from_session_id === session.session_id
      );

      children.forEach((child, index) => {
        layoutSession(child, level + 1, offsetX + index * HORIZONTAL_SPACING);
      });
    };

    // Layout all root sessions
    rootSessions.forEach((root, index) => {
      layoutSession(root, 0, index * HORIZONTAL_SPACING * 2);
    });

    // Convert to React Flow nodes
    return sessions.map(session => {
      // Use stored position from boardLayout if available, otherwise use auto-layout
      const storedLayout = boardLayout?.[session.session_id];
      const autoPosition = nodeMap.get(session.session_id) || { x: 0, y: 0 };
      const position = storedLayout || autoPosition;

      // Find zone name and color if pinned
      const parentZoneId = storedLayout?.parentId;
      const zoneName = parentZoneId ? zoneLabels[parentZoneId] || 'Unknown Zone' : undefined;
      const zoneColor =
        parentZoneId && board?.objects?.[parentZoneId]
          ? (board.objects[parentZoneId] as { color?: string }).color
          : undefined;

      return {
        id: session.session_id,
        type: 'sessionNode',
        position: { x: position.x, y: position.y },
        draggable: true,
        // Set parentId if session is pinned to a zone
        parentId: parentZoneId,
        // Optional: constrain session to stay within zone bounds
        extent: parentZoneId ? ('parent' as const) : undefined,
        data: {
          session,
          tasks: tasks[session.session_id] || [],
          users,
          currentUserId,
          onTaskClick,
          onSessionClick: () => onSessionClick?.(session.session_id),
          onDelete: onSessionDelete,
          onOpenSettings,
          onUnpin: handleUnpin,
          compact: false,
          // Pass pinning info for UI
          isPinned: !!parentZoneId,
          parentZoneId,
          zoneName,
          zoneColor,
        },
      };
    });
  }, [
    board, // Need full board access for zone colors
    boardLayout, // Recalculate when layout changes (memoized for stability)
    zoneLabels, // Recalculate when zone labels change (but not colors!)
    sessions,
    tasks,
    users,
    currentUserId,
    onSessionClick,
    onTaskClick,
    onSessionDelete,
    onOpenSettings,
    handleUnpin,
  ]);

  // Convert session relationships to React Flow edges
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    sessions.forEach(session => {
      // Fork relationship (dashed line)
      if (session.genealogy.forked_from_session_id) {
        edges.push({
          id: `fork-${session.genealogy.forked_from_session_id}-${session.session_id}`,
          source: session.genealogy.forked_from_session_id,
          target: session.session_id,
          type: 'default',
          animated: false,
          style: { strokeDasharray: '5,5', stroke: '#00b4d8' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#00b4d8',
          },
          label: 'fork',
          labelStyle: { fill: '#00b4d8', fontWeight: 500 },
        });
      }

      // Spawn relationship (solid line)
      if (session.genealogy.parent_session_id) {
        edges.push({
          id: `spawn-${session.genealogy.parent_session_id}-${session.session_id}`,
          source: session.genealogy.parent_session_id,
          target: session.session_id,
          type: 'default',
          animated: true,
          style: { stroke: '#9333ea' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#9333ea',
          },
          label: 'spawn',
          labelStyle: { fill: '#9333ea', fontWeight: 500 },
        });
      }
    });

    return edges;
  }, [sessions]);

  // Store ReactFlow instance ref
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  // Cursor tracking hook
  useCursorTracking({
    client,
    boardId: board?.board_id as BoardID | null,
    reactFlowInstance: reactFlowInstanceRef.current,
    enabled: !!board && !!client,
  });

  // Presence tracking hook (get remote cursors)
  const { remoteCursors } = usePresence({
    client,
    boardId: board?.board_id as BoardID | null,
    users,
    enabled: !!board && !!client,
  });

  // Create cursor nodes from remote cursors (for minimap visibility)
  // Large dimensions ensure good visibility in minimap (visual size controlled by inverse scaling)
  const cursorNodes: Node[] = useMemo(() => {
    const nodes: Node[] = [];

    for (const [userId, { x, y, user }] of remoteCursors.entries()) {
      nodes.push({
        id: `cursor-${userId}`,
        type: 'cursor',
        position: { x, y },
        draggable: false,
        selectable: false,
        focusable: false,
        data: { user },
        width: 150,
        height: 150,
        style: {
          pointerEvents: 'none',
          transition: 'transform 0.1s ease-out',
        },
      });
    }

    return nodes;
  }, [remoteCursors]);

  // Sync SESSION nodes only (don't trigger on zone changes)
  useEffect(() => {
    if (isDraggingRef.current) return;

    setNodes(currentNodes => {
      // Separate existing nodes by type
      const existingZones = currentNodes.filter(n => n.type === 'zone');
      const existingCursors = currentNodes.filter(n => n.type === 'cursor');

      // Update session nodes with preserved state
      const updatedSessions = initialNodes.map(newNode => {
        const existingNode = currentNodes.find(n => n.id === newNode.id);
        const localPosition = localPositionsRef.current[newNode.id];
        const incomingPosition = newNode.position;
        const positionChanged =
          localPosition &&
          (Math.abs(localPosition.x - incomingPosition.x) > 1 ||
            Math.abs(localPosition.y - incomingPosition.y) > 1);

        if (positionChanged) {
          delete localPositionsRef.current[newNode.id];
          return { ...newNode, selected: existingNode?.selected };
        }

        if (localPosition) {
          return { ...newNode, position: localPosition, selected: existingNode?.selected };
        }

        return { ...newNode, selected: existingNode?.selected };
      });

      // Merge: sessions + existing zones + existing cursors
      return [...updatedSessions, ...existingZones, ...existingCursors];
    });
  }, [initialNodes, setNodes]);

  // Sync ZONE nodes separately
  useEffect(() => {
    if (isDraggingRef.current) return;

    const boardObjectNodes = getBoardObjectNodes();

    setNodes(currentNodes => {
      // Keep existing sessions and cursors, replace zones
      const sessions = currentNodes.filter(n => n.type === 'sessionNode');
      const cursors = currentNodes.filter(n => n.type === 'cursor');

      // Update zones with preserved selection state
      const zones = boardObjectNodes
        .filter(z => !deletedObjectsRef.current.has(z.id))
        .map(newZone => {
          const existingZone = currentNodes.find(n => n.id === newZone.id);
          // Preserve selected state from existing zone
          return { ...newZone, selected: existingZone?.selected };
        });

      return [...sessions, ...zones, ...cursors];
    });
  }, [getBoardObjectNodes, setNodes]); // REMOVED setNodes from dependencies

  // Sync CURSOR nodes separately
  useEffect(() => {
    if (isDraggingRef.current) return;

    setNodes(currentNodes => {
      // Keep existing sessions and zones, replace cursors
      const sessions = currentNodes.filter(n => n.type === 'sessionNode');
      const zones = currentNodes.filter(n => n.type === 'zone');

      return [...sessions, ...zones, ...cursorNodes];
    });
  }, [cursorNodes, setNodes]); // REMOVED setNodes from dependencies

  // Sync edges
  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]); // REMOVED setEdges from dependencies

  // Intercept onNodesChange to detect resize events
  const onNodesChange = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: React Flow change event types are not exported
    (changes: any) => {
      // Detect resize by checking for dimensions changes
      // biome-ignore lint/suspicious/noExplicitAny: React Flow change event types are not exported
      changes.forEach((change: any) => {
        if (change.type === 'dimensions' && change.dimensions) {
          const node = nodes.find(n => n.id === change.id);
          if (node?.type === 'zone') {
            // Check if dimensions actually changed (to avoid infinite loop from React Flow emitting unchanged dimensions)
            const currentWidth = node.style?.width;
            const currentHeight = node.style?.height;
            const newWidth = change.dimensions.width;
            const newHeight = change.dimensions.height;

            // Skip if dimensions haven't changed (tolerance of 1px for floating point)
            if (
              currentWidth &&
              currentHeight &&
              Math.abs(Number(currentWidth) - newWidth) < 1 &&
              Math.abs(Number(currentHeight) - newHeight) < 1
            ) {
              return;
            }

            // Accumulate resize updates
            pendingResizeUpdatesRef.current[change.id] = {
              width: newWidth,
              height: newHeight,
            };

            // Clear existing timer
            if (resizeTimerRef.current) {
              clearTimeout(resizeTimerRef.current);
            }

            // Debounce: wait 500ms after last resize before persisting
            resizeTimerRef.current = setTimeout(async () => {
              const updates = pendingResizeUpdatesRef.current;
              pendingResizeUpdatesRef.current = {};

              if (!board || !client) return;

              // Persist all resize changes
              for (const [nodeId, dimensions] of Object.entries(updates)) {
                const objectData = board.objects?.[nodeId];
                if (objectData && objectData.type === 'zone') {
                  const updatedObject = {
                    ...objectData,
                    width: dimensions.width,
                    height: dimensions.height,
                  };

                  try {
                    await client.service('boards').patch(board.board_id, {
                      _action: 'upsertObject',
                      objectId: nodeId,
                      objectData: updatedObject,
                      // biome-ignore lint/suspicious/noExplicitAny: Board patch with custom _action field
                    } as any);
                  } catch (error) {
                    console.error('Failed to persist zone resize:', error);
                  }
                }
              }
            }, 500);
          }
        }
      });

      // Call the original handler
      onNodesChangeInternal(changes);
    },
    [nodes, board, client, onNodesChangeInternal]
  );

  // Handle node drag start
  const handleNodeDragStart: NodeDragHandler = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  // Handle node drag - track local position changes
  const handleNodeDrag: NodeDragHandler = useCallback((_event, node) => {
    // Track this position locally so we don't get overwritten by WebSocket updates
    localPositionsRef.current[node.id] = {
      x: node.position.x,
      y: node.position.y,
    };
  }, []);

  // Handle node drag end - persist layout to board (debounced)
  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => {
      if (!board || !client || !reactFlowInstanceRef.current) return;

      // Track final position locally
      localPositionsRef.current[node.id] = {
        x: node.position.x,
        y: node.position.y,
      };

      // Accumulate position updates
      pendingLayoutUpdatesRef.current[node.id] = {
        x: node.position.x,
        y: node.position.y,
      };

      // Clear existing timer
      if (layoutUpdateTimerRef.current) {
        clearTimeout(layoutUpdateTimerRef.current);
      }

      // Debounce: wait 500ms after last drag before persisting
      layoutUpdateTimerRef.current = setTimeout(async () => {
        const updates = pendingLayoutUpdatesRef.current;
        pendingLayoutUpdatesRef.current = {};
        isDraggingRef.current = false;

        try {
          // Separate updates for sessions vs board objects
          const sessionUpdates: Record<string, { x: number; y: number; parentId?: string }> = {};
          const objectUpdates: Record<string, { x: number; y: number }> = {};

          // Find all current nodes to check types
          const currentNodes = nodes;

          for (const [nodeId, position] of Object.entries(updates)) {
            const draggedNode = currentNodes.find(n => n.id === nodeId);

            if (draggedNode?.type === 'zone') {
              // Zone moved - just update position
              objectUpdates[nodeId] = position;
            } else if (draggedNode?.type === 'sessionNode') {
              // Session moved - check for pin/unpin
              const currentLayout = board.layout?.[nodeId];
              const currentParentId = currentLayout?.parentId;

              // Check if session overlaps with any zone (using center point)
              const intersections = reactFlowInstanceRef.current?.getIntersectingNodes(draggedNode);
              const overlappingZone = intersections?.find(n => n.type === 'zone');

              if (overlappingZone && !currentParentId) {
                // Session dropped into a zone → Check for trigger, then PIN IT
                const zoneNode = currentNodes.find(n => n.id === overlappingZone.id);
                if (zoneNode) {
                  const relativeX = position.x - zoneNode.position.x;
                  const relativeY = position.y - zoneNode.position.y;

                  // Check if zone has a trigger configured
                  const zoneObject = board.objects?.[overlappingZone.id];
                  const zoneTrigger = zoneObject?.type === 'zone' ? zoneObject.trigger : undefined;

                  // Pin the session (always pin, trigger execution is optional)
                  sessionUpdates[nodeId] = {
                    x: relativeX,
                    y: relativeY,
                    parentId: overlappingZone.id,
                  };
                  console.log(
                    `📌 Pinned session ${nodeId.substring(0, 8)} to zone ${overlappingZone.id.substring(0, 8)}`
                  );

                  // If zone has a trigger, show confirmation modal AFTER pinning
                  if (zoneTrigger) {
                    const zoneName =
                      zoneObject?.type === 'zone' ? zoneObject.label : 'Unknown Zone';
                    // Use setTimeout to show modal after the layout update completes
                    setTimeout(() => {
                      setTriggerModal({
                        sessionId: nodeId,
                        zoneName,
                        trigger: zoneTrigger,
                        pinData: {
                          x: relativeX,
                          y: relativeY,
                          parentId: overlappingZone.id,
                        },
                      });
                    }, 600); // Wait for debounce to complete
                  }
                }
              } else if (!overlappingZone && currentParentId) {
                // Session dragged outside zone → UNPIN IT
                // Convert relative position to absolute
                const parentZone = currentNodes.find(n => n.id === currentParentId);
                if (parentZone) {
                  const absoluteX = position.x + parentZone.position.x;
                  const absoluteY = position.y + parentZone.position.y;

                  sessionUpdates[nodeId] = {
                    x: absoluteX,
                    y: absoluteY,
                    parentId: undefined, // Remove parent
                  };
                  console.log(
                    `📍 Unpinned session ${nodeId.substring(0, 8)} from zone ${currentParentId.substring(0, 8)}`
                  );
                }
              } else {
                // No pin/unpin change - just update position
                sessionUpdates[nodeId] = {
                  x: position.x,
                  y: position.y,
                  parentId: currentParentId,
                };
              }
            }
          }

          // Update session positions in layout
          if (Object.keys(sessionUpdates).length > 0) {
            const newLayout = { ...board.layout };

            // Merge updates
            for (const [sessionId, update] of Object.entries(sessionUpdates)) {
              newLayout[sessionId] = update;
            }

            await client.service('boards').patch(board.board_id, {
              layout: newLayout,
            });

            console.log('✓ Layout persisted:', Object.keys(sessionUpdates).length, 'sessions');
          }

          // Update board object positions
          if (Object.keys(objectUpdates).length > 0) {
            await batchUpdateObjectPositions(objectUpdates);
          }
        } catch (error) {
          console.error('Failed to persist layout:', error);
        }
      }, 500);
    },
    [board, client, batchUpdateObjectPositions, nodes]
  );

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (layoutUpdateTimerRef.current) {
        clearTimeout(layoutUpdateTimerRef.current);
      }
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  // Canvas pointer handlers for drag-to-draw zones
  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!reactFlowInstanceRef.current) return;

      // Zone tool: start drag-to-draw
      if (activeTool === 'zone') {
        setDrawingZone({
          start: { x: event.pageX, y: event.pageY },
          end: { x: event.pageX, y: event.pageY },
        });
      }
    },
    [activeTool]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (activeTool === 'zone' && drawingZone && event.buttons === 1) {
        setDrawingZone({
          start: drawingZone.start,
          end: { x: event.pageX, y: event.pageY },
        });
      }
    },
    [activeTool, drawingZone]
  );

  const handlePointerUp = useCallback(() => {
    if (activeTool === 'zone' && drawingZone && reactFlowInstanceRef.current) {
      const { start, end } = drawingZone;

      // Calculate position and dimensions in screen space
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const screenWidth = Math.abs(end.x - start.x);
      const screenHeight = Math.abs(end.y - start.y);

      // Only create zone if dragged (not just clicked)
      if (screenWidth > 50 && screenHeight > 50) {
        const position = reactFlowInstanceRef.current.screenToFlowPosition({
          x: minX,
          y: minY,
        });

        // Convert dimensions to flow space (account for zoom)
        const viewport = reactFlowInstanceRef.current.getViewport();
        const width = screenWidth / viewport.zoom;
        const height = screenHeight / viewport.zoom;

        // Create zone with drawn dimensions
        const objectId = `zone-${Date.now()}`;

        // Optimistic update
        setNodes(nodes => [
          ...nodes,
          {
            id: objectId,
            type: 'zone',
            position,
            draggable: true,
            style: { width, height, zIndex: -1 },
            data: {
              objectId,
              label: 'New Zone',
              width,
              height,
              color: '#d9d9d9',
              onUpdate: (id: string, data: BoardObject) => {
                if (board && client) {
                  client
                    .service('boards')
                    .patch(board.board_id, {
                      _action: 'upsertObject',
                      objectId: id,
                      objectData: data,
                      // biome-ignore lint/suspicious/noExplicitAny: Board patch with custom _action field
                    } as any)
                    .catch(console.error);
                }
              },
            },
          },
        ]);

        // Persist to backend
        if (board && client) {
          client
            .service('boards')
            .patch(board.board_id, {
              _action: 'upsertObject',
              objectId,
              objectData: {
                type: 'zone',
                x: position.x,
                y: position.y,
                width,
                height,
                label: 'New Zone',
                color: '#d9d9d9',
              },
              // biome-ignore lint/suspicious/noExplicitAny: Board patch with custom _action field
            } as any)
            .catch((error: unknown) => {
              console.error('Failed to add zone:', error);
              setNodes(nodes => nodes.filter(n => n.id !== objectId));
            });
        }
      }

      setDrawingZone(null);
      setActiveTool('select');
    }
  }, [activeTool, drawingZone, board, client, setNodes]);

  // Node click handler for eraser mode
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (activeTool === 'eraser') {
        // Only delete board objects (zones), not sessions or cursors
        if (node.type === 'zone') {
          deleteObject(node.id);
        }
        return;
      }

      // Normal session click (ignore cursor nodes)
      if (node.type === 'sessionNode') {
        onSessionClick?.(node.id);
      }
    },
    [activeTool, deleteObject, onSessionClick]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'z') setActiveTool('zone');
      if (e.key === 'e') setActiveTool('eraser');
      if (e.key === 'Escape') setActiveTool('select');
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected nodes
        const selectedNodes = nodes.filter(n => n.selected);
        selectedNodes.forEach(n => {
          if (n.type === 'zone') {
            deleteObject(n.id);
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, deleteObject]);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Drawing preview for zone */}
      {drawingZone && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(drawingZone.start.x, drawingZone.end.x),
            top: Math.min(drawingZone.start.y, drawingZone.end.y),
            width: Math.abs(drawingZone.end.x - drawingZone.start.x),
            height: Math.abs(drawingZone.end.y - drawingZone.start.y),
            border: '2px dashed #1677ff',
            background: 'rgba(22, 119, 255, 0.1)',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        />
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onInit={instance => {
          reactFlowInstanceRef.current = instance;
        }}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={[20, 20]}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={activeTool === 'select'}
        className={`dark tool-mode-${activeTool}`}
      >
        <Background />
        <Controls position="top-left" showInteractive={false}>
          {/* Custom toolbox buttons */}
          <ControlButton
            onClick={e => {
              e.stopPropagation();
              setActiveTool('select');
            }}
            title="Select (Esc)"
            style={{
              borderLeft: activeTool === 'select' ? '3px solid #1677ff' : 'none',
            }}
          >
            <SelectOutlined style={{ fontSize: '16px' }} />
          </ControlButton>
          <ControlButton
            onClick={e => {
              e.stopPropagation();
              setActiveTool('zone');
            }}
            title="Add Zone (Z)"
            style={{
              borderLeft: activeTool === 'zone' ? '3px solid #1677ff' : 'none',
            }}
          >
            <BorderOutlined style={{ fontSize: '16px' }} />
          </ControlButton>
          <ControlButton
            onClick={e => {
              e.stopPropagation();
              setActiveTool(activeTool === 'eraser' ? 'select' : 'eraser');
            }}
            title="Eraser (E) - Click to toggle"
            style={{
              borderLeft: activeTool === 'eraser' ? '3px solid #ff4d4f' : 'none',
              color: activeTool === 'eraser' ? '#ff4d4f' : 'inherit',
              backgroundColor: activeTool === 'eraser' ? '#fff1f0' : 'transparent',
            }}
          >
            <DeleteOutlined style={{ fontSize: '16px' }} />
          </ControlButton>
        </Controls>
        <MiniMap
          nodeColor={node => {
            // Handle cursor nodes (show as bright color)
            if (node.type === 'cursor') return '#faad14';

            // Handle board objects (zones)
            if (node.type === 'zone') return '#d9d9d9';

            // Handle session nodes
            const session = node.data.session as Session;
            if (!session) return '#d9d9d9';

            switch (session.status) {
              case 'running':
                return '#1890ff';
              case 'completed':
                return '#52c41a';
              case 'failed':
                return '#ff4d4f';
              default:
                return '#d9d9d9';
            }
          }}
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Trigger confirmation modal */}
      {triggerModal &&
        (() => {
          // Pre-render the template for display in modal
          const session = sessions.find(s => s.session_id === triggerModal.sessionId);
          let renderedPromptPreview = triggerModal.trigger.text;

          if (session) {
            try {
              // Lookup worktree data for this session
              const worktree = worktrees.find(wt => wt.worktree_id === session.worktree_id);

              const context = {
                session: {
                  description: session.description || '',
                  context: session.custom_context || {},
                },
                board: {
                  name: board?.name || '',
                  description: board?.description || '',
                  context: board?.custom_context || {},
                },
                worktree: worktree
                  ? {
                      name: worktree.name || '',
                      ref: worktree.ref || '',
                      issue_url: worktree.issue_url || '',
                      pull_request_url: worktree.pull_request_url || '',
                      notes: worktree.notes || '',
                      path: worktree.path || '',
                      context: worktree.custom_context || {},
                    }
                  : {
                      name: '',
                      ref: '',
                      issue_url: '',
                      pull_request_url: '',
                      notes: '',
                      path: '',
                      context: {},
                    },
              };
              const template = Handlebars.compile(triggerModal.trigger.text);
              renderedPromptPreview = template(context);
            } catch (error) {
              console.error('Template render error for preview:', error);
              // Fall back to raw text
            }
          }

          return (
            <Modal
              title={`Execute Trigger for "${triggerModal.zoneName}"?`}
              open={true}
              onOk={async () => {
                if (!client) {
                  console.error('❌ Cannot execute trigger: client not available');
                  setTriggerModal(null);
                  return;
                }

                console.log('✅ Execute trigger:', triggerModal.trigger);

                try {
                  const { sessionId, trigger } = triggerModal;

                  // Find the session to get its data for Handlebars context
                  const session = sessions.find(s => s.session_id === sessionId);
                  if (!session) {
                    console.error('❌ Session not found:', sessionId);
                    setTriggerModal(null);
                    return;
                  }

                  // Lookup worktree data for this session
                  const worktree = worktrees.find(wt => wt.worktree_id === session.worktree_id);

                  // Build Handlebars context from session, board, and worktree data
                  const context = {
                    session: {
                      description: session.description || '',
                      // User-defined custom context
                      context: session.custom_context || {},
                    },
                    board: {
                      name: board?.name || '',
                      description: board?.description || '',
                      context: board?.custom_context || {},
                    },
                    worktree: worktree
                      ? {
                          name: worktree.name || '',
                          ref: worktree.ref || '',
                          issue_url: worktree.issue_url || '',
                          pull_request_url: worktree.pull_request_url || '',
                          notes: worktree.notes || '',
                          path: worktree.path || '',
                          context: worktree.custom_context || {},
                        }
                      : {
                          name: '',
                          ref: '',
                          issue_url: '',
                          pull_request_url: '',
                          notes: '',
                          path: '',
                          context: {},
                        },
                  };

                  // Render template with Handlebars
                  let renderedPrompt: string;
                  try {
                    const template = Handlebars.compile(trigger.text);
                    renderedPrompt = template(context);
                    console.log('📝 Rendered template:', renderedPrompt);
                  } catch (templateError) {
                    console.error('❌ Handlebars template error:', templateError);
                    // Fallback to raw text if template fails
                    renderedPrompt = trigger.text;
                  }

                  // All trigger types now use the unified prompt endpoint
                  // This ensures consistent behavior: task creation, agent invocation, streaming, etc.
                  switch (trigger.type) {
                    case 'prompt':
                    case 'task':
                    case 'subtask': {
                      // Prefix subtasks for clarity
                      const prompt =
                        trigger.type === 'subtask' ? `[Subtask] ${renderedPrompt}` : renderedPrompt;

                      await client.service(`sessions/${sessionId}/prompt`).create({
                        prompt,
                      });

                      console.log(
                        `✨ ${trigger.type} triggered for session ${sessionId.substring(0, 8)}: ${prompt.substring(0, 50)}...`
                      );
                      break;
                    }

                    default:
                      console.warn(`⚠️  Unknown trigger type: ${trigger.type}`);
                  }
                } catch (error) {
                  console.error('❌ Failed to execute trigger:', error);
                } finally {
                  setTriggerModal(null);
                }
              }}
              onCancel={() => {
                console.log('⏭️  Trigger skipped by user');
                setTriggerModal(null);
              }}
              okText="Yes, Execute"
              cancelText="No, Skip"
            >
              <Paragraph>
                The session has been pinned to <Text strong>{triggerModal.zoneName}</Text>.
              </Paragraph>
              <Paragraph>
                This zone has a <Text strong>{triggerModal.trigger.type}</Text> trigger configured:
              </Paragraph>
              <Paragraph
                code
                style={{
                  whiteSpace: 'pre-wrap',
                  background: '#1f1f1f',
                  padding: '12px',
                  borderRadius: '4px',
                }}
              >
                {renderedPromptPreview}
              </Paragraph>
              <Paragraph type="secondary">
                Would you like to execute this trigger for the session now?
              </Paragraph>
            </Modal>
          );
        })()}
    </div>
  );
};

export default SessionCanvas;
