/**
 * Anonymous Authentication Strategy
 *
 * Allows unauthenticated access when enabled in config.
 * Used for local-first development where authentication is optional.
 */

import { loadConfig } from '@agor/core/config';
import type { AuthenticationResult } from '@feathersjs/authentication';
import { AuthenticationBaseStrategy } from '@feathersjs/authentication';
import type { Params } from '@feathersjs/feathers';

// NotAuthenticated error (simplified implementation)
class NotAuthenticated extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotAuthenticated';
  }
}

export class AnonymousStrategy extends AuthenticationBaseStrategy {
  /**
   * Authenticate anonymous request
   */
  async authenticate(
    _authentication: { strategy: string },
    _params: Params
  ): Promise<AuthenticationResult> {
    // Load config to check if anonymous access is allowed
    const config = await loadConfig();

    if (!config.daemon?.allowAnonymous) {
      throw new NotAuthenticated('Anonymous access disabled');
    }

    // Return anonymous user with admin privileges (local mode)
    return {
      authentication: { strategy: 'anonymous' },
      user: {
        id: 'anonymous',
        email: 'anonymous@localhost',
        role: 'admin',
        anonymous: true,
      },
    };
  }
}
