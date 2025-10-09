# WebSocket Architecture

**Status:** Current implementation + Future design
**Related:** [architecture.md](../concepts/architecture.md), [state-broadcasting.md](state-broadcasting.md)

## Overview

Agor uses FeathersJS with Socket.io for real-time bidirectional communication between the daemon and clients (UI, CLI). This document describes:

1. **Current Implementation** - Simple broadcast-to-all architecture
2. **Future Design** - Board-based channel segmentation for scalability
3. **Multiplayer Features** - Collaborative editing with presence awareness

---

## Current Implementation (v0.1)

### Architecture

**Topology:** Single global channel broadcasting all events to all connected clients

```
┌─────────────┐
│   Daemon    │
│  :3030      │
└──────┬──────┘
       │
       │ 'everybody' channel
       ├─────────────┬─────────────┬─────────────┐
       │             │             │             │
   ┌───▼───┐    ┌───▼───┐    ┌───▼───┐    ┌───▼───┐
   │ UI #1 │    │ UI #2 │    │ CLI   │    │ UI #3 │
   │ :5173 │    │ :5173 │    │       │    │ :5173 │
   └───────┘    └───────┘    └───────┘    └───────┘
      ↑            ↑            ↑            ↑
      └────────────┴────────────┴────────────┘
           All receive ALL events
```

### Configuration

**File:** `apps/agor-daemon/src/index.ts`

```typescript
// Configure Socket.io with CORS
app.configure(
  socketio({
    cors: {
      origin: 'http://localhost:5173',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      credentials: true,
    },
  })
);

// Join all connections to 'everybody' channel
app.on('connection', connection => {
  app.channel('everybody').join(connection);
});

// Publish all events to all clients
app.publish(() => {
  return app.channel('everybody');
});
```

### Event Flow

**Example: Deleting a session**

1. **Client action:** UI calls `client.service('sessions').remove(sessionId)`
2. **Backend service:** `SessionsService.remove()` → `DrizzleService.remove()`
3. **Event emission:** `this.emit('removed', session, params)`
4. **Channel publishing:** FeathersJS publishes to `app.channel('everybody')`
5. **Client reception:** All connected clients receive `'sessions removed'` event
6. **State update:** `useAgorData` hook updates local state via `handleSessionRemoved`

### Supported Events

Each service emits CRUD events:

| Service     | Events                                     | Description                       |
| ----------- | ------------------------------------------ | --------------------------------- |
| `/sessions` | `created`, `patched`, `updated`, `removed` | Session lifecycle                 |
| `/tasks`    | `created`, `patched`, `updated`, `removed` | Task lifecycle                    |
| `/messages` | `created`, `patched`, `updated`, `removed` | Message creation (bulk or single) |
| `/boards`   | `created`, `patched`, `updated`, `removed` | Board lifecycle                   |
| `/repos`    | `created`, `patched`, `updated`, `removed` | Repository management             |

### Client Setup

**File:** `apps/agor-ui/src/hooks/useAgorData.ts`

```typescript
// Subscribe to session events
const sessionsService = client.service('sessions');
sessionsService.on('created', handleSessionCreated);
sessionsService.on('patched', handleSessionPatched);
sessionsService.on('updated', handleSessionPatched);
sessionsService.on('removed', handleSessionRemoved);

// Cleanup on unmount
return () => {
  sessionsService.removeListener('created', handleSessionCreated);
  sessionsService.removeListener('patched', handleSessionPatched);
  sessionsService.removeListener('updated', handleSessionPatched);
  sessionsService.removeListener('removed', handleSessionRemoved);
};
```

### Limitations

**Current architecture has scalability issues:**

1. **No segmentation** - All clients receive all events (wasteful for large deployments)
2. **No privacy** - Can't restrict events to specific users/teams
3. **No filtering** - Clients receive events for boards they're not viewing
4. **Bandwidth waste** - Clients must filter events client-side

**Performance impact:**

- With 1000 sessions and 10 connected clients, a single session update triggers 10 WebSocket messages
- Client must filter events to determine relevance
- Not suitable for multi-tenant or high-scale deployments

---

## Future Design: Board-Based Channels (v0.2+)

### Architecture

**Topology:** Multiple named channels, one per board

```
┌─────────────────────────────────────────────────┐
│              Daemon :3030                        │
├─────────────┬──────────────┬────────────────────┤
│ Channel:    │ Channel:     │ Channel:           │
│ board-123   │ board-456    │ board-789          │
└──────┬──────┴──────┬───────┴──────┬─────────────┘
       │             │              │
   ┌───▼───┐    ┌───▼───┐     ┌────▼────┐
   │ UI #1 │    │ UI #2 │     │ UI #3   │
   │Board  │    │Board  │     │Board    │
   │ 123   │    │ 456   │     │ 789     │
   └───────┘    └───────┘     └─────────┘
     Only         Only          Only
   board-123    board-456     board-789
    events       events         events
```

### Channel Management

**Dynamic channel joining based on active board:**

```typescript
// When client opens a board
app.on('join-board', (data: { boardId: string }, { connection }) => {
  if (!connection) return;

  // Leave previous board channels
  Object.keys(app.channels).forEach(channelName => {
    if (channelName.startsWith('board-')) {
      app.channel(channelName).leave(connection);
    }
  });

  // Join new board channel
  app.channel(`board-${data.boardId}`).join(connection);
  console.log(`Connection ${connection.id} joined board-${data.boardId}`);
});

// When client leaves a board
app.on('leave-board', (data: { boardId: string }, { connection }) => {
  if (!connection) return;
  app.channel(`board-${data.boardId}`).leave(connection);
});
```

### Selective Event Publishing

**Publish events only to relevant board channels:**

```typescript
// Publish session events to the board that contains the session
app.service('sessions').publish('created', (session, context) => {
  // Find which board(s) contain this session
  const boards = await boardsService.findBoardsContainingSession(session.session_id);

  // Publish to all relevant board channels
  return boards.map(board => app.channel(`board-${board.board_id}`));
});

app.service('sessions').publish('removed', (session, context) => {
  // Broadcast removal to all board channels (session might be in multiple boards)
  const boards = await boardsService.findBoardsContainingSession(session.session_id);
  return boards.map(board => app.channel(`board-${board.board_id}`));
});

// Tasks and messages always belong to a session, so inherit session's board membership
app.service('tasks').publish('created', async (task, context) => {
  const session = await sessionsService.get(task.session_id);
  const boards = await boardsService.findBoardsContainingSession(session.session_id);
  return boards.map(board => app.channel(`board-${board.board_id}`));
});
```

### Client-Side Channel Subscription

**UI automatically joins/leaves channels when switching boards:**

```typescript
// In useAgorClient hook
const joinBoard = useCallback(
  (boardId: string) => {
    if (!client) return;

    // Emit join-board event to daemon
    client.io.emit('join-board', { boardId });

    console.log(`Joined board channel: board-${boardId}`);
  },
  [client]
);

const leaveBoard = useCallback(
  (boardId: string) => {
    if (!client) return;

    client.io.emit('leave-board', { boardId });
    console.log(`Left board channel: board-${boardId}`);
  },
  [client]
);

// Auto-join when board changes
useEffect(() => {
  if (currentBoardId) {
    joinBoard(currentBoardId);

    // Cleanup: leave on unmount or board change
    return () => leaveBoard(currentBoardId);
  }
}, [currentBoardId, joinBoard, leaveBoard]);
```

### Benefits

1. **Scalability** - Clients only receive events for boards they're viewing
2. **Privacy** - Board-level access control (future: team/user channels)
3. **Bandwidth efficiency** - Dramatic reduction in unnecessary WebSocket traffic
4. **Server efficiency** - Daemon only sends events to interested clients

### Implementation Tasks

- [ ] Add board-channel management to daemon
- [ ] Implement `join-board` / `leave-board` event handlers
- [ ] Add logic to find boards containing sessions (index or cache)
- [ ] Update service publish methods to target board channels
- [ ] Add client-side channel subscription in `useAgorClient`
- [ ] Track active board in UI state
- [ ] Handle edge cases (session in multiple boards, board deletion)

---

## Future: Multiplayer Collaborative Features (v0.3+)

### Requirements

**Real-time collaborative editing with presence awareness:**

1. **Cursor tracking** - See where other users are pointing/clicking
2. **Selection highlights** - Show which sessions/tasks others are viewing
3. **Live editing indicators** - "User X is editing session Y"
4. **Typing indicators** - "User X is typing..."
5. **User roster** - Who's currently viewing this board
6. **Activity feed** - Recent actions by all users

### Presence Service

**Track connected users and their state:**

```typescript
interface UserPresence {
  userId: string;
  username: string;
  boardId: string;
  cursorPosition?: { x: number; y: number };
  selectedSessionId?: string;
  selectedTaskId?: string;
  isTyping: boolean;
  lastActive: Date;
}

// New service: /presence
app.service('presence').publish('updated', (presence, context) => {
  // Broadcast presence updates only to users on the same board
  return app.channel(`board-${presence.boardId}`);
});
```

### Cursor Broadcasting

**Real-time cursor position updates:**

```typescript
// Client sends cursor position updates (throttled to ~10Hz)
const throttledCursorUpdate = throttle((x: number, y: number) => {
  client.service('presence').patch(myUserId, {
    cursorPosition: { x, y },
    lastActive: new Date(),
  });
}, 100);

// Client receives others' cursor positions
client.service('presence').on('updated', presence => {
  if (presence.userId !== myUserId) {
    updateCursorOverlay(presence.userId, presence.cursorPosition);
  }
});
```

### Selection Highlighting

**Highlight sessions/tasks being viewed by others:**

```typescript
// User clicks on a session
const handleSessionClick = (sessionId: string) => {
  client.service('presence').patch(myUserId, {
    selectedSessionId: sessionId,
    selectedTaskId: null,
  });
};

// Render highlights for selected sessions
const renderSessionCard = (session: Session) => {
  const viewingUsers = presenceList.filter(p =>
    p.selectedSessionId === session.session_id && p.userId !== myUserId
  );

  return (
    <SessionCard
      session={session}
      viewingUsers={viewingUsers}  // Show avatars of viewing users
      highlightColor={viewingUsers[0]?.color}
    />
  );
};
```

### Optimistic Updates with Conflict Resolution

**Handle concurrent edits gracefully:**

```typescript
// Optimistic UI update (instant feedback)
const handleSessionUpdate = async (sessionId: string, updates: Partial<Session>) => {
  // 1. Update local state immediately
  setSessions(prev => prev.map(s => (s.session_id === sessionId ? { ...s, ...updates } : s)));

  // 2. Send update to server
  try {
    const updated = await client.service('sessions').patch(sessionId, updates);

    // 3. Server broadcasts to other clients
    // 4. Other clients receive 'patched' event and update their state
  } catch (error) {
    // 5. Rollback on error
    setSessions(prev => prev.map(s => (s.session_id === sessionId ? originalSession : s)));
  }
};
```

### User Roster

**Display who's currently on the board:**

```typescript
// Daemon tracks presence
app.on('connection', (connection) => {
  // Create presence record
  presenceService.create({
    userId: connection.user.id,
    username: connection.user.name,
    boardId: null,
    lastActive: new Date(),
  });

  // Join user-specific channel for direct messages
  app.channel(`user-${connection.user.id}`).join(connection);
});

app.on('disconnect', (connection) => {
  // Remove presence record
  presenceService.remove(connection.user.id);
});

// UI displays roster
const BoardUserRoster = ({ boardId }: { boardId: string }) => {
  const users = usePresenceList(boardId);

  return (
    <div className="user-roster">
      {users.map(user => (
        <Avatar key={user.userId} src={user.avatar} name={user.username} />
      ))}
    </div>
  );
};
```

### Activity Feed

**Real-time log of user actions:**

```typescript
// Daemon logs activity events
app.service('sessions').hooks({
  after: {
    create: [async (context) => {
      await activityService.create({
        userId: context.params.connection?.user.id,
        action: 'created',
        resourceType: 'session',
        resourceId: context.result.session_id,
        timestamp: new Date(),
      });
    }],
  },
});

// UI displays activity feed
const ActivityFeed = ({ boardId }: { boardId: string }) => {
  const activities = useActivityFeed(boardId);

  return (
    <div className="activity-feed">
      {activities.map(activity => (
        <ActivityItem key={activity.id} activity={activity} />
      ))}
    </div>
  );
};
```

### Performance Considerations

**Throttling and debouncing:**

1. **Cursor updates:** Throttle to 10-20 updates/sec max
2. **Typing indicators:** Debounce by 500ms
3. **Presence heartbeat:** Update every 30 seconds
4. **Activity feed:** Batch updates, limit to recent 50 items

**Network efficiency:**

- Use binary protocols for cursor data (smaller payloads)
- Compress presence updates (delta encoding)
- Implement exponential backoff for reconnection
- Use server-side filtering to reduce client-side processing

### Implementation Phases

**Phase 1: Basic Presence (v0.3)**

- [ ] Presence service with user roster
- [ ] Join/leave board notifications
- [ ] User list UI component

**Phase 2: Selection Tracking (v0.4)**

- [ ] Selected session/task tracking
- [ ] Highlight overlays on canvas
- [ ] User avatar badges on cards

**Phase 3: Cursor & Typing (v0.5)**

- [ ] Real-time cursor position tracking
- [ ] Cursor overlays with user names
- [ ] Typing indicators for text inputs

**Phase 4: Activity Feed (v0.6)**

- [ ] Activity logging service
- [ ] Activity feed UI component
- [ ] Activity filtering and search

---

## Channel Hierarchy (Future)

**Multi-level channel structure for granular access control:**

```
app.channel('all')                     // Global events (system announcements)
  ├─ app.channel('team-acme')          // Team-level events
  │    ├─ app.channel('board-123')    // Board-level events
  │    │    ├─ app.channel('session-abc')  // Session-level events (for deep collaboration)
  │    │    └─ app.channel('session-def')
  │    └─ app.channel('board-456')
  └─ app.channel('team-widgets')
       └─ app.channel('board-789')
```

**Use cases:**

- **Team channel:** Notify all team members of new repos, board creation
- **Board channel:** Real-time updates for sessions on this board
- **Session channel:** Deep collaboration on a single session (pair programming)

---

## Related Documents

- [architecture.md](../concepts/architecture.md) - Overall system architecture
- [state-broadcasting.md](state-broadcasting.md) - Real-time sync patterns (if exists)
- [conversation-design.md](conversation-design.md) - Conversational interface patterns

---

## References

- [FeathersJS Channels API](https://feathersjs.com/api/channels.html)
- [Socket.io Rooms](https://socket.io/docs/v4/rooms/)
- [Figma Multiplayer Architecture](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Collaborative Editing CRDTs](https://www.inkandswitch.com/local-first/)
