import type { Meta, StoryObj } from '@storybook/react';
import { mockSessionA, mockSessionB, mockSessionC } from '../../mocks/sessions';
import { TaskStatus } from '@agor/core/types';
import SessionHeader from './SessionHeader';

const meta = {
  title: 'Components/SessionHeader',
  component: SessionHeader,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SessionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    session: mockSessionA,
    showCounts: true,
  },
};

export const Running: Story = {
  args: {
    session: mockSessionA,
    showCounts: true,
  },
};

export const Completed: Story = {
  args: {
    session: {
      ...mockSessionA,
      status: TaskStatus.COMPLETED,
    },
    showCounts: true,
  },
};

export const Failed: Story = {
  args: {
    session: {
      ...mockSessionA,
      status: TaskStatus.FAILED,
    },
    showCounts: true,
  },
};

export const Idle: Story = {
  args: {
    session: mockSessionB,
    showCounts: true,
  },
};

export const ForkedSession: Story = {
  args: {
    session: mockSessionB,
    showCounts: true,
  },
};

export const SpawnedSession: Story = {
  args: {
    session: mockSessionC,
    showCounts: true,
  },
};

export const WithoutCounts: Story = {
  args: {
    session: mockSessionA,
    showCounts: false,
  },
};

export const Clickable: Story = {
  args: {
    session: mockSessionA,
    showCounts: true,
    onClick: () => alert('Session header clicked!'),
  },
};

export const LongDescription: Story = {
  args: {
    session: {
      ...mockSessionA,
      description:
        'Build comprehensive authentication system with JWT tokens, OAuth 2.0 support, and secure password storage patterns',
    },
    showCounts: true,
  },
};

export const DifferentAgent: Story = {
  args: {
    session: mockSessionC,
    showCounts: true,
  },
};
