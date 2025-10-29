/**
 * Facepile - shows active users on a board
 *
 * Displays user avatars with tooltips and optional cursor panning
 */

import type { ActiveUser } from '@agor/core/types';
import { Avatar, Tooltip } from 'antd';
import type { CSSProperties } from 'react';
import './Facepile.css';

export interface FacepileProps {
  activeUsers: ActiveUser[];
  currentUserId?: string;
  maxVisible?: number;
  size?: number;
  onUserClick?: (userId: string, cursorPosition?: { x: number; y: number }) => void;
  style?: CSSProperties;
}

/**
 * Facepile component showing active users with emoji avatars
 */
export const Facepile: React.FC<FacepileProps> = ({
  activeUsers,
  maxVisible = 5,
  size = 32,
  onUserClick,
  style,
}) => {
  // Show first N users, with overflow count
  const visibleUsers = activeUsers.slice(0, maxVisible);
  const overflowCount = Math.max(0, activeUsers.length - maxVisible);

  if (activeUsers.length === 0) {
    return null;
  }

  return (
    <div className="facepile" style={style}>
      {visibleUsers.map(({ user, cursor }) => (
        <Tooltip
          key={user.user_id}
          title={
            <div>
              <div>{user.name || user.email}</div>
              {cursor && (
                <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
                  Click to view position
                </div>
              )}
            </div>
          }
        >
          <Avatar
            size={size}
            style={{
              cursor: onUserClick && cursor ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (onUserClick && cursor) {
                onUserClick(user.user_id, cursor);
              }
            }}
          >
            {user.emoji || '👤'}
          </Avatar>
        </Tooltip>
      ))}

      {overflowCount > 0 && (
        <Tooltip title={`+${overflowCount} more active users`}>
          <Avatar size={size}>+{overflowCount}</Avatar>
        </Tooltip>
      )}
    </div>
  );
};
