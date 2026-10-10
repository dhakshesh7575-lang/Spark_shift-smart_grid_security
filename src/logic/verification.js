// ---------------------------------------------------------------------------
// src/logic/verification.js
//
// Code-pattern verification engine for the Admin Office Server.
//
// Every authorised meter chip transmits a code of the shape:
//
//     <TRANSFORMER_PREFIX>-<METER_ID>-<CHECKSUM>
//     e.g.   TRF-A-MTR-0451-9F2C
//
// The transformer chip transmits its own prefix code.  The server:
//   1. Splits the incoming code by '-'.
//   2. Reads the transformer prefix (e.g. "TRF-A").
//   3. Confirms the meter is registered under that transformer.
//   4. Recomputes the checksum and compares it.
//   5. VERIFIED if all match, otherwise FAILED (which triggers a WiFi trace).
//
// NOTE ON REAL FIRMWARE: this file is the reference implementation of the
// algorithm that would be replicated (in C) on both the meter and transformer
// microcontrollers.  Keep the checksum function in sync across all devices.
// ---------------------------------------------------------------------------

import { REGISTERED_METERS, TRANSFORMERS } from './constants';

/**
 * Deterministic 16-bit checksum over the transformer prefix + meter id.
 *
 * Implementation: a classic djb2 hash.  It is intentionally simple so it can
 * be reproduced bit-for-bit inside an 8-bit/32-bit MCU with no dependencies.
 *
 * @param {string} prefix  Transformer prefix, e.g. "TRF-A".
 * @param {string} meterId Meter chip id, e.g. "MTR-0451".
 * @returns {string} 4 hex characters, upper-case, e.g. "9F2C".
 */
export function generateChecksum(prefix, meterId) {
  const input = `${prefix}:${meterId}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    // hash = hash * 33 XOR charCode   (djb2 variant)
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    // Keep it within 32-bit unsigned range.
    hash = hash >>> 0;
  }
  // Fold down to 16 bits, then format as 4 upper-case hex digits.
  const folded = (hash ^ (hash >>> 16)) & 0xffff;
  return folded.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Split a raw transmitted code into its three logical parts.
 *
 * The prefix is always the first two dash-separated tokens ("TRF-A"), the
 * checksum is the final token, and everything in between is the meter id
 * (which itself may contain a dash, e.g. "MTR-0451").
 *
 * @param {string} code Raw code string received by the server.
 * @returns {{prefix: string, meterId: string, checksum: string} | null}
 *          Parsed parts, or null when the shape is too malformed to parse.
 */
export function parseCode(code) {
  if (typeof code !== 'string') return null;
  const parts = code.trim().split('-');
  if (parts.length < 3) return null; // need at least PRE-FIX-CHK

  const checksum = parts[parts.length - 1].toUpperCase();
  const prefix = `${parts[0]}-${parts[1]}`;
  const meterId = parts.slice(2, parts.length - 1).join('-');

  if (!meterId) return null; // e.g. "UNKNOWN-XXXX-0000" has no meter id token
  return { prefix, meterId, checksum };
}

/**
 * Verify a code against the Admin Server registry.
 *
 * @param {string} code Raw code transmitted by a chip.
 * @returns {{
 *   status: 'VERIFIED' | 'FAILED',
 *   transformerId: string | null,
 *   meterId: string | null,
 *   reason: string
 * }}
 */
export function verifyCode(code) {
  const parsed = parseCode(code);

  // --- Step 1: structural validation -------------------------------------
  if (!parsed) {
    return {
      status: 'FAILED',
      transformerId: null,
      meterId: null,
      reason: 'Malformed / unparseable code structure',
    };
  }

  const { prefix, meterId, checksum } = parsed;

  // --- Step 2: does the transformer prefix exist? ------------------------
  const transformer = TRANSFORMERS.find((t) => t.prefix === prefix);
  if (!transformer) {
    return {
      status: 'FAILED',
      transformerId: null,
      meterId,
      reason: `Unknown transformer prefix "${prefix}"`,
    };
  }

  // --- Step 3: is the meter registered at all? ---------------------------
  const registeredPrefix = REGISTERED_METERS[meterId];
  if (!registeredPrefix) {
    return {
      status: 'FAILED',
      transformerId: prefix,
      meterId,
      reason: `Meter "${meterId}" is not registered`,
    };
  }

  // --- Step 4: is the meter under the transformer it claims? -------------
  if (registeredPrefix !== prefix) {
    return {
      status: 'FAILED',
      transformerId: prefix,
      meterId,
      reason: `Meter "${meterId}" is registered under ${registeredPrefix}, not ${prefix}`,
    };
  }

  // --- Step 5: recompute and compare the checksum ------------------------
  const expected = generateChecksum(prefix, meterId);
  if (expected !== checksum) {
    return {
      status: 'FAILED',
      transformerId: prefix,
      meterId,
      reason: `Checksum mismatch (expected ${expected}, got ${checksum})`,
    };
  }

  // --- All checks passed: electricity is authorised to flow --------------
  return {
    status: 'VERIFIED',
    transformerId: prefix,
    meterId,
    reason: 'Chip codes match; meter belongs to transformer; checksum valid',
  };
}
