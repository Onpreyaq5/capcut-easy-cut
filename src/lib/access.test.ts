import { describe, expect, it } from 'vitest';
import { capcutAccess, processingAccess } from './access';
import type { UserRec } from './authStore';

function user(overrides: Partial<UserRec> = {}): UserRec {
  return {
    email: 'creator@example.com',
    hash: '',
    salt: '',
    role: 'user',
    consent: true,
    verified: true,
    createdAt: new Date(0).toISOString(),
    loginCount: 0,
    lastLoginAt: '',
    ...overrides,
  };
}

describe('plan access', () => {
  it('allows free users to process while quota remains', () => {
    expect(processingAccess(user()).ok).toBe(true);
  });

  it('does not allow free users to create CapCut drafts', () => {
    const result = capcutAccess(user());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('plan');
  });

  it('allows pro users to create CapCut drafts', () => {
    expect(capcutAccess(user({ plan: 'pro' })).ok).toBe(true);
  });

  it('treats owners as studio users', () => {
    const result = capcutAccess(user({ role: 'owner', plan: 'free' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quota.plan).toBe('studio');
  });
});

