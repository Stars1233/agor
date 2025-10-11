import { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { Session, Task } from '../../types';
import SessionCard from '../SessionCard';

interface SessionCanvasProps {
  sessions: Session[];
  tasks: Record<string, Task[]>;
  onSessionClick?: (sessionId: string) => void;
  onTaskClick?: (taskId: string) => void;
  onSessionUpdate?: (sessionId: string, updates: Partial<Session>) => void;
  onSessionDelete?: (sessionId: string) => void;
}

interface SessionNodeData {
  session: Session;
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
  onSessionClick?: () => void;
  onUpdate?: (sessionId: string, updates: Partial<Session>) => void;
  onDelete?: (sessionId: string) => void;
  compact?: boolean;
}

// Custom node component that renders SessionCard
const SessionNode = ({ data }: { data: SessionNodeData }) => {
  return (
    <div className="session-node" style={{ cursor: 'default' }}>
      <SessionCard
        session={data.session}
        tasks={data.tasks}
        onTaskClick={data.onTaskClick}
        onSessionClick={data.onSessionClick}
        onUpdate={data.onUpdate}
        onDelete={data.onDelete}
        compact={data.compact}
      />
    </div>
  );
};

// Define nodeTypes outside component to avoid recreation on every render
const nodeTypes = {
  sessionNode: SessionNode,
};

const SessionCanvas = ({
  sessions,
  tasks,
  onSessionClick,
  onTaskClick,
  onSessionUpdate,
  onSessionDelete,
}: SessionCanvasProps) => {
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
      const position = nodeMap.get(session.session_id) || { x: 0, y: 0 };
      return {
        id: session.session_id,
        type: 'sessionNode',
        position,
        draggable: true,
        data: {
          session,
          tasks: tasks[session.session_id] || [],
          onTaskClick,
          onSessionClick: () => onSessionClick?.(session.session_id),
          onUpdate: onSessionUpdate,
          onDelete: onSessionDelete,
          compact: false,
        },
      };
    });
  }, [sessions, tasks, onSessionClick, onTaskClick, onSessionUpdate, onSessionDelete]);

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

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes when sessions or tasks change (WebSocket updates)
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Sync edges when sessions change (genealogy updates)
  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={[20, 20]}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={node => {
            const session = node.data.session as Session;
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
    </div>
  );
};

export default SessionCanvas;
