import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { mockSessionA, mockSessionB, mockSessionC } from '../../mocks/sessions';
import { mockTasksBySession } from '../../mocks/tasks';
import { TaskStatus } from '@agor/core/types';
import SessionDrawer from '../SessionDrawer';
import SessionCard from './SessionCard';

const meta = {
  title: 'Components/SessionCard',
  component: SessionCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SessionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RunningSession: Story = {
  args: {
    session: mockSessionA,
    tasks: mockTasksBySession.abc123,
  },
};

export const ForkedSession: Story = {
  args: {
    session: mockSessionB,
    tasks: mockTasksBySession.def456,
  },
};

export const SpawnedSession: Story = {
  args: {
    session: mockSessionC,
    tasks: mockTasksBySession.ghi789,
  },
};

export const Collapsed: Story = {
  args: {
    session: mockSessionA,
    tasks: mockTasksBySession.abc123,
    defaultExpanded: false,
  },
};

export const Interactive: Story = {
  args: {
    session: mockSessionA,
    tasks: mockTasksBySession.abc123,
    onTaskClick: (taskId: string) => alert(`Task clicked: ${taskId}`),
    onDrawerOpen: () => alert('Open drawer clicked!'),
  },
};

export const CompletedSession: Story = {
  args: {
    session: { ...mockSessionC, status: TaskStatus.COMPLETED },
    tasks: mockTasksBySession.ghi789,
  },
};

export const IdleSession: Story = {
  args: {
    session: mockSessionB,
    tasks: mockTasksBySession.def456,
  },
};

export const ManyTasksSession: Story = {
  args: {
    session: mockSessionA,
    tasks: mockTasksBySession.abc123, // Now has 16 tasks
    onDrawerOpen: () => alert('Open drawer for all tasks'),
  },
};

export const TitleOnly: Story = {
  args: {
    session: { ...mockSessionA, description: undefined },
    tasks: mockTasksBySession.abc123,
  },
};

export const LegacyDescriptionOnly: Story = {
  args: {
    session: { ...mockSessionA, title: undefined },
    tasks: mockTasksBySession.abc123,
  },
};

// Fully integrated example with SessionDrawer
export const WithDrawer = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 8, background: 'rgba(0,0,0,0.1)', borderRadius: 4 }}>
        <strong>Try the controls:</strong>
        <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
          <li>Click the header to collapse/expand the session</li>
          <li>Click expand icon (⬆️) to open the full session drawer</li>
          <li>Click "X more tasks" to open the drawer</li>
        </ul>
        {drawerOpen && 'Drawer is open'}
      </div>

      <SessionCard
        session={mockSessionA}
        tasks={mockTasksBySession.abc123}
        onDrawerOpen={() => setDrawerOpen(true)}
        onTaskClick={taskId => alert(`Task clicked: ${taskId}`)}
      />

      <SessionDrawer
        session={mockSessionA}
        tasks={mockTasksBySession.abc123}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
};
