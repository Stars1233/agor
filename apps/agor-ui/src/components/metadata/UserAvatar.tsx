import { Space, Tooltip } from 'antd';
import type { User } from '@agor/core/types';

export interface UserAvatarProps {
  user: User;
  showName?: boolean;
  size?: 'small' | 'default' | 'large';
}

const sizeMap = {
  small: 16,
  default: 20,
  large: 24,
};

/**
 * UserAvatar - Displays user emoji/avatar with optional name
 *
 * Used in metadata tags and conversation views to show user identity
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  showName = true,
  size = 'default',
}) => {
  const fontSize = sizeMap[size];

  return (
    <Tooltip title={`${user.name || user.email} (${user.role})`}>
      <Space size={4}>
        <span style={{ fontSize }}>{user.emoji || '👤'}</span>
        {showName && <span>{user.name || user.email.split('@')[0]}</span>}
      </Space>
    </Tooltip>
  );
};
