import type { Meta, StoryObj } from '@storybook/react';
import { Button } from 'antd';
import { useState } from 'react';
import { mockSessionA, mockSessionB, mockSessionC } from '../../mocks/sessions';
import { mockTasksBySession } from '../../mocks/tasks';
import { TaskStatus } from '@agor/core/types';
import SessionDrawer from './SessionDrawer';

const meta = {
  title: 'Components/SessionDrawer',
  component: SessionDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SessionDrawer>;

export default meta;
// biome-ignore lint/correctness/noUnusedVariables: Story type used for type annotations below
type Story = StoryObj<typeof meta>;

// Interactive story with button to open drawer
export const Default = () => {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: 24 }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        Open Session Drawer
      </Button>
      <SessionDrawer
        session={mockSessionA}
        tasks={mockTasksBySession.abc123}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};

export const RunningSession = () => {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: 24 }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        Open Running Session
      </Button>
      <SessionDrawer
        session={mockSessionA}
        tasks={mockTasksBySession.abc123}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};

export const ForkedSession = () => {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: 24 }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        Open Forked Session
      </Button>
      <SessionDrawer
        session={mockSessionB}
        tasks={mockTasksBySession.def456}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};

export const SpawnedSession = () => {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: 24 }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        Open Spawned Session
      </Button>
      <SessionDrawer
        session={mockSessionC}
        tasks={mockTasksBySession.ghi789}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};

export const CompletedSession = () => {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: 24 }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        Open Completed Session
      </Button>
      <SessionDrawer
        session={{ ...mockSessionC, status: TaskStatus.COMPLETED }}
        tasks={mockTasksBySession.ghi789}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};

export const ManyTasks = () => {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: 24 }}>
      <Button type="primary" onClick={() => setOpen(true)}>
        Open Session with Many Tasks
      </Button>
      <SessionDrawer
        session={mockSessionA}
        tasks={mockTasksBySession.abc123} // Has 16 tasks
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};
