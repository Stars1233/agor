import { Tag } from 'antd';
import type { User } from '@agor/core/types';
import { UserAvatar } from './UserAvatar';

export interface CreatedByTagProps {
  createdBy: string; // user_id
  currentUserId?: string; // logged-in user's ID
  users: User[]; // all users for lookup
  prefix?: string; // e.g., "Created by" or "Prompted by"
}

/**
 * CreatedByTag - Shows user metadata tag when creator differs from current user
 *
 * Only renders if createdBy !== currentUserId (or if currentUserId is undefined)
 * Used in SessionCard, SessionDrawer, and task views to show multiplayer attribution
 */
export const CreatedByTag: React.FC<CreatedByTagProps> = ({
  createdBy,
  currentUserId,
  users,
  prefix = 'Created by',
}) => {
  // Don't show tag if current user created it
  if (createdBy === currentUserId) {
    return null;
  }

  // Look up the user
  const user = users.find(u => u.user_id === createdBy);

  // If user not found or is anonymous, show minimal tag
  if (!user || createdBy === 'anonymous') {
    return (
      <Tag color="default" style={{ fontSize: 11 }}>
        {prefix}: {createdBy === 'anonymous' ? 'Anonymous' : 'Unknown User'}
      </Tag>
    );
  }

  return (
    <Tag color="blue" style={{ fontSize: 11 }}>
      {prefix}: <UserAvatar user={user} showName={true} size="small" />
    </Tag>
  );
};
