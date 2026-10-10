// ---------------------------------------------------------------------------
// src/data/tnebTransformers.js
//
// Seed dataset for the "Transformers" sidebar feature: Tamil Nadu EB (TNEB)
// distribution transformers + the full Tamil Nadu city/district list used by
// the City filter.
//
// SINGLE SOURCE OF TRUTH: `src/logic/constants.js` re-exports TN_TRANSFORMERS
// as `TRANSFORMERS`, so the existing verification/wifi-trace logic and this new
// browsing feature read from the same dataset. Do not create a second copy.
//
// The first three entries are the original simulation transformers (TRF-A/B/C)
// and MUST keep their id/prefix/label/capacityKva unchanged.
// ---------------------------------------------------------------------------

/** Capacity ratings (kVA) typical of TNEB distribution transformers. */
export const CAPACITIES_KVA = [100, 160, 250, 315, 400, 630];

/** Feeder-name building blocks used to synthesise realistic transformer names. */
const FEEDER_WORDS = [
  'North',
  'South',
  'East',
  'West',
  'Central',
  'Industrial',
  'Market',
  'Lake',
  'Hill',
  'Riverside',
  'College',
  'Bus Stand',
];

/**
 * Tamil Nadu cities AND districts available to the City filter.
 * `district` links a city to its administrative district; for entries that are
 * themselves districts, `name === district`. Coordinates are approximate and
 * only used to place transformers on a map-like view.
 */
export const TN_LOCATIONS = [
  // --- The original simulation cities get explicit entries below too. ---
  { name: 'Chennai', district: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Coimbatore', district: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
  { name: 'Madurai', district: 'Madurai', lat: 9.9252, lng: 78.1198 },
  { name: 'Trichy', district: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047 },
  { name: 'Salem', district: 'Salem', lat: 11.6643, lng: 78.146 },
  { name: 'Tirunelveli', district: 'Tirunelveli', lat: 8.7139, lng: 77.7567 },
  { name: 'Erode', district: 'Erode', lat: 11.341, lng: 77.7172 },
  { name: 'Vellore', district: 'Vellore', lat: 12.9165, lng: 79.1325 },
  { name: 'Thoothukudi', district: 'Thoothukudi', lat: 8.7642, lng: 78.1348 },
  { name: 'Dindigul', district: 'Dindigul', lat: 10.3624, lng: 77.9695 },
  { name: 'Thanjavur', district: 'Thanjavur', lat: 10.787, lng: 79.1378 },
  { name: 'Ranipet', district: 'Ranipet', lat: 12.9249, lng: 79.33 },
  { name: 'Sivakasi', district: 'Virudhunagar', lat: 9.4533, lng: 77.7986 },
  { name: 'Karur', district: 'Karur', lat: 10.9601, lng: 78.0766 },
  { name: 'Udhagamandalam', district: 'Nilgiris', lat: 11.4102, lng: 76.695 },
  { name: 'Hosur', district: 'Krishnagiri', lat: 12.7409, lng: 77.8253 },
  { name: 'Nagercoil', district: 'Kanyakumari', lat: 8.1833, lng: 77.4119 },
  { name: 'Kanchipuram', district: 'Kanchipuram', lat: 12.8342, lng: 79.7036 },
  { name: 'Kumarapalayam', district: 'Namakkal', lat: 11.436, lng: 77.705 },
  { name: 'Karaikudi', district: 'Sivaganga', lat: 10.07, lng: 78.78 },
  { name: 'Neyveli', district: 'Cuddalore', lat: 11.608, lng: 79.479 },
  { name: 'Cuddalore', district: 'Cuddalore', lat: 11.748, lng: 79.7714 },
  { name: 'Kumbakonam', district: 'Thanjavur', lat: 10.9601, lng: 79.3845 },
  { name: 'Tiruppur', district: 'Tiruppur', lat: 11.1085, lng: 77.3411 },
  { name: 'Pollachi', district: 'Coimbatore', lat: 10.658, lng: 77.008 },
  { name: 'Rajapalayam', district: 'Virudhunagar', lat: 9.453, lng: 77.554 },
  { name: 'Gudiyatham', district: 'Vellore', lat: 12.947, lng: 78.871 },
  { name: 'Pudukkottai', district: 'Pudukkottai', lat: 10.3833, lng: 78.8001 },
  { name: 'Vaniyambadi', district: 'Tirupathur', lat: 12.6819, lng: 78.6196 },
  { name: 'Tiruvannamalai', district: 'Tiruvannamalai', lat: 12.2253, lng: 79.0747 },
  { name: 'Tiruvarur', district: 'Tiruvarur', lat: 10.7724, lng: 79.6368 },
  { name: 'Nagapattinam', district: 'Nagapattinam', lat: 10.7672, lng: 79.8449 },
  { name: 'Viluppuram', district: 'Viluppuram', lat: 11.9401, lng: 79.4861 },
  { name: 'Krishnagiri', district: 'Krishnagiri', lat: 12.5186, lng: 78.2137 },
  { name: 'Dharmapuri', district: 'Dharmapuri', lat: 12.1211, lng: 78.1583 },
  { name: 'Ariyalur', district: 'Ariyalur', lat: 11.1401, lng: 79.0762 },
  { name: 'Perambalur', district: 'Perambalur', lat: 11.2342, lng: 78.88 },
  { name: 'Namakkal', district: 'Namakkal', lat: 11.2189, lng: 78.1674 },
  { name: 'Nilgiris', district: 'Nilgiris', lat: 11.4102, lng: 76.695 },
  { name: 'Theni', district: 'Theni', lat: 10.0104, lng: 77.4768 },
  { name: 'Ramanathapuram', district: 'Ramanathapuram', lat: 9.3639, lng: 78.8395 },
  { name: 'Virudhunagar', district: 'Virudhunagar', lat: 9.568, lng: 77.9624 },
  { name: 'Tenkasi', district: 'Tenkasi', lat: 8.9594, lng: 77.3152 },
  { name: 'Kallakurichi', district: 'Kallakurichi', lat: 11.7382, lng: 78.96 },
  { name: 'Chengalpattu', district: 'Chengalpattu', lat: 12.6819, lng: 79.9888 },
  { name: 'Tirupathur', district: 'Tirupathur', lat: 12.4954, lng: 78.5678 },
  { name: 'Mayiladuthurai', district: 'Mayiladuthurai', lat: 11.1018, lng: 79.6522 },
  // --- Districts not already covered by a city entry above. ---
  { name: 'Kanyakumari', district: 'Kanyakumari', lat: 8.0883, lng: 77.5385 },
  { name: 'Sivaganga', district: 'Sivaganga', lat: 9.8433, lng: 78.4809 },
  { name: 'Tiruvallur', district: 'Tiruvallur', lat: 13.1231, lng: 79.912 },
  { name: 'Tiruchirappalli', district: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047 },
];

/** The 38 administrative districts of Tamil Nadu. */
export const TN_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
  'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur',
  'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal',
  'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem',
  'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli',
  'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai',
  'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar',
];

/**
 * Build a deterministic inspection date (no Date.now()) so the seed data and
 * its tests are reproducible.
 */
function inspectionDate(locationIndex, feederIndex) {
  const year = 2024 - (locationIndex % 3);
  const month = String(((locationIndex + feederIndex) % 12) + 1).padStart(2, '0');
  const day = String(((locationIndex * 7 + feederIndex * 3) % 27) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The original simulation transformers — ids/prefixes/labels preserved. */
const CORE_TRANSFORMERS = [
  {
    id: 'TRF-A',
    prefix: 'TRF-A',
    label: 'Transformer A — Ward 1',
    capacityKva: 250,
    name: 'Chennai Ward 1 Feeder',
    city: 'Chennai',
    district: 'Chennai',
    status: 'authorised',
    feeder: 'Ward 1 Feeder',
    lastInspected: '2024-02-11',
    location: { lat: 13.0827, lng: 80.2707 },
  },
  {
    id: 'TRF-B',
    prefix: 'TRF-B',
    label: 'Transformer B — Ward 2',
    capacityKva: 400,
    name: 'Coimbatore Ward 2 Feeder',
    city: 'Coimbatore',
    district: 'Coimbatore',
    status: 'authorised',
    feeder: 'Ward 2 Feeder',
    lastInspected: '2024-03-02',
    location: { lat: 11.0168, lng: 76.9558 },
  },
  {
    id: 'TRF-C',
    prefix: 'TRF-C',
    label: 'Transformer C — Ward 3',
    capacityKva: 315,
    name: 'Madurai Ward 3 Feeder',
    city: 'Madurai',
    district: 'Madurai',
    status: 'authorised',
    feeder: 'Ward 3 Feeder',
    lastInspected: '2024-01-19',
    location: { lat: 9.9252, lng: 78.1198 },
  },
];

/**
 * Expand the location list into a realistic spread of TNEB transformers.
 * Every location gets 2–4 transformers, always including at least one
 * `authorised` and one `unauthorised`, so no city filter is ever empty.
 */
function buildTransformers() {
  const out = [...CORE_TRANSFORMERS];
  let seq = 0;

  TN_LOCATIONS.forEach((loc, li) => {
    const count = 2 + (li % 3); // 2, 3, or 4
    for (let j = 0; j < count; j += 1) {
      seq += 1;
      const word = FEEDER_WORDS[(li + j) % FEEDER_WORDS.length];
      const status = j % 2 === 0 ? 'authorised' : 'unauthorised';

      out.push({
        id: `TN-TRF-${String(seq).padStart(4, '0')}`,
        prefix: `TRF-${String(seq).padStart(3, '0')}`, // two-token, unique
        name: `${loc.name} ${word} Feeder #${j + 1}`,
        label: `${loc.name} ${word} Feeder (${status})`,
        city: loc.name,
        district: loc.district,
        status,
        capacityKva: CAPACITIES_KVA[(li + j) % CAPACITIES_KVA.length],
        feeder: `${word} Feeder`,
        lastInspected: inspectionDate(li, j),
        location: {
          lat: Number((loc.lat + ((j % 3) - 1) * 0.012).toFixed(5)),
          lng: Number((loc.lng + (((j + 1) % 3) - 1) * 0.012).toFixed(5)),
        },
      });
    }
  });

  return out;
}

/** The authoritative TNEB transformer dataset. */
export const TN_TRANSFORMERS = buildTransformers();
