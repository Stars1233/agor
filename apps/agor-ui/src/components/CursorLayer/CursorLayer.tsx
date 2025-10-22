/**
 * CursorLayer - renders remote user cursors on React Flow canvas
 *
 * Transforms flow coordinates to screen coordinates and renders cursor elements
 */

import { theme } from 'antd';
import { useMemo } from 'react';
import type { ReactFlowInstance } from 'reactflow';
import { useViewport } from 'reactflow';
import type { User } from '@agor/core/types';
import './CursorLayer.css';

const { useToken } = theme;

export interface CursorLayerProps {
  remoteCursors: Map<string, { x: number; y: number; user: User; timestamp: number }>;
  reactFlowInstance: ReactFlowInstance | null;
}

interface CursorPosition {
  userId: string;
  screenX: number;
  screenY: number;
  user: User;
}

/**
 * CursorLayer component - renders remote user cursors with labels
 */
export const CursorLayer: React.FC<CursorLayerProps> = ({ remoteCursors, reactFlowInstance }) => {
  const { token } = useToken();

  // Get current viewport (x, y, zoom) - triggers re-render on pan/zoom
  const _viewport = useViewport();

  // Transform flow coordinates to screen coordinates
  // Memoized to only recalculate when remoteCursors or viewport changes
  const cursorPositions = useMemo(() => {
    if (!reactFlowInstance) {
      return [];
    }

    const positions: CursorPosition[] = [];

    for (const [userId, { x, y, user }] of remoteCursors.entries()) {
      // Convert flow coordinates to screen coordinates
      const screenPos = reactFlowInstance.flowToScreenPosition({ x, y });

      positions.push({
        userId,
        screenX: screenPos.x,
        screenY: screenPos.y,
        user,
      });
    }

    return positions;
  }, [remoteCursors, reactFlowInstance]);

  if (cursorPositions.length === 0) {
    return null;
  }

  return (
    <div className="cursor-layer">
      {cursorPositions.map(({ userId, screenX, screenY, user }) => (
        <div
          key={userId}
          className="remote-cursor"
          style={{
            left: screenX,
            top: screenY,
          }}
        >
          {/* Cursor SVG */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="cursor-icon"
            style={{ color: token.colorPrimary }}
            role="img"
            aria-label={`${user.name}'s cursor`}
          >
            <path
              d="M5.5 3.5L18.5 12L11 14L8 20.5L5.5 3.5Z"
              fill="currentColor"
              stroke={token.colorBgElevated}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>

          {/* User label */}
          <div
            className="cursor-label"
            style={{
              background: token.colorBgElevated,
              color: token.colorText,
              boxShadow: token.boxShadowSecondary,
            }}
          >
            <span className="cursor-emoji">{user.emoji || '👤'}</span>
            <span className="cursor-name">{user.name || user.email}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
