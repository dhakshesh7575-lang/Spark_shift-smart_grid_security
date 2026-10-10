// ---------------------------------------------------------------------------
// src/logic/constants.js
//
// Shared constants for the Smart Electricity Theft Detection & Tracing System.
//
// In the real world these values would live in the Admin Office database and
// only the relevant slice would be mirrored into each microcontroller's
// firmware during provisioning.  Below, every group is annotated so the file
// maps cleanly onto real firmware/database tables.
// ---------------------------------------------------------------------------

// The authoritative TNEB transformer registry now lives in the data layer.
// Re-exported here so existing consumers (verification.js, wifiTrace.js,
// ThiefPanel.jsx) keep importing `TRANSFORMERS` from './constants' unchanged.
import { TN_TRANSFORMERS, TN_LOCATIONS, TN_DISTRICTS } from '../data/tnebTransformers';

export { TN_TRANSFORMERS, TN_LOCATIONS, TN_DISTRICTS };

/**
 * Distribution transformers known to the Admin Server.
 *
 * `prefix` is the code-pattern marker that binds a meter chip to the physical
 * transformer it is wired under.  On real hardware this is usually burned into
 * the transformer chip's flash at commissioning time.
 */
export const TRANSFORMERS = TN_TRANSFORMERS;

/**
 * Registry of authorised meters (would be the `meters` table on the server).
 *
 *   key   = meter chip id  (e.g. "MTR-0451")
 *   value = transformer prefix the meter is registered under (e.g. "TRF-A")
 *
 * The Admin Server consults this table to confirm that a meter reporting a
 * given transformer prefix is genuinely registered under that transformer.
 */
export const REGISTERED_METERS = {
  'MTR-0451': 'TRF-A',
  'MTR-0452': 'TRF-A',
  'MTR-1122': 'TRF-B',
  'MTR-1130': 'TRF-C',
  'MTR-2044': 'TRF-C',
};

/**
 * The authorised meter simulated by the bottom-left panel.
 * Maps to one ESP32/Arduino-based meter chip running the legit firmware.
 */
export const AUTHORISED_METER = {
  meterId: 'MTR-0451',
  prefix: 'TRF-A',
  owner: 'House #12, Maple Street',
};

/** Seconds between automatic meter heart-beats (the looping 00:00:30 timer). */
export const VERIFY_INTERVAL_SECONDS = 30;

/**
 * Cities used to synthesise an approximate geolocation for a caught thief.
 * On real hardware the location would come from a gateway/Cell-ID/IP lookup.
 */
export const CITIES = [
  { city: 'Chennai',    country: 'IN', lat: 13.0827, lng: 80.2707 },
  { city: 'Bengaluru',  country: 'IN', lat: 12.9716, lng: 77.5946 },
  { city: 'Hyderabad',  country: 'IN', lat: 17.3850, lng: 78.4867 },
  { city: 'Mumbai',     country: 'IN', lat: 19.0760, lng: 72.8777 },
  { city: 'Delhi',      country: 'IN', lat: 28.6139, lng: 77.2090 },
  { city: 'Coimbatore', country: 'IN', lat: 11.0168, lng: 76.9558 },
];

/** Realistic-looking parts used to build a fake thief Wi-Fi SSID. */
export const SSID_PREFIXES = ['TP-LINK', 'Airtel', 'JioFiber', 'BSNL', 'D-Link', 'ACT', 'HOME', 'NETGEAR'];
export const SSID_SUFFIXES = ['_4G', '-2.4G', '_5G', '', '_Guest', '-Ext'];
