/**
 * Permission Management
 *
 * Exports permission service and types for UI-based permission prompts.
 */

export type { PermissionDecision, PermissionRequest } from './permission-service';
export { PermissionService } from './permission-service';

// NOTE: PermissionScope is exported from types/message.ts as an enum
