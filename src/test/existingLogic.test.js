// Regression tests for the EXISTING logic layer + data contract.
import { describe, it, expect } from 'vitest';
import { verifyCode, generateChecksum, parseCode } from '../logic/verification';
import { TRANSFORMERS } from '../logic/constants';

describe('existing verification logic', () => {
  it('verifies the authorised meter code', () => {
    const code = `TRF-A-MTR-0451-${generateChecksum('TRF-A', 'MTR-0451')}`;
    const result = verifyCode(code);
    expect(result.status).toBe('VERIFIED');
    expect(result.transformerId).toBe('TRF-A');
  });

  it('generateChecksum is deterministic', () => {
    expect(generateChecksum('TRF-A', 'MTR-0451')).toBe(generateChecksum('TRF-A', 'MTR-0451'));
  });

  it('rejects malformed codes', () => {
    expect(verifyCode('UNKNOWN-XXXX-0000').status).toBe('FAILED');
    expect(parseCode('UNKNOWN-XXXX-0000')).toBeNull();
  });
});

describe('existing transformer data contract', () => {
  it('keeps the original TRF-A/B/C entries intact', () => {
    for (const prefix of ['TRF-A', 'TRF-B', 'TRF-C']) {
      const t = TRANSFORMERS.find((x) => x.prefix === prefix);
      expect(t, `${prefix} must still exist`).toBeDefined();
    }
    const a = TRANSFORMERS.find((x) => x.prefix === 'TRF-A');
    expect(a.label).toBe('Transformer A — Ward 1');
    expect(a.capacityKva).toBe(250);
  });

  it('every transformer has a unique prefix and the base fields', () => {
    const prefixes = TRANSFORMERS.map((t) => t.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const t of TRANSFORMERS) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.prefix).toBe('string');
      expect(typeof t.label).toBe('string');
    }
  });
});
