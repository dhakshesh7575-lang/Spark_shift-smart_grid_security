// Component tests for the frontend network-details display (AdminServer).
// Covers the LAC / Cell ID fallback rules: (a) Wi-Fi present,
// (b) LAC + Cell ID present, (c) all absent, plus the defensive both-present case.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import AdminServer from '../components/AdminServer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function rowsFor(container) {
  return Array.from(container.querySelectorAll('.trace-row')).map((row) => ({
    label: row.querySelector('.trace-label').textContent,
    value: row.querySelector('.trace-value').textContent,
  }));
}

function valueOf(rows, label) {
  const row = rows.find((r) => r.label === label);
  return row ? row.value : undefined;
}

const baseTrace = {
  bssid: '00:98:D1:38:10:6F',
  localIp: '192.168.1.5',
  publicIp: '1.1.1.1',
  lat: 12.97,
  lng: 77.59,
  city: 'Bengaluru',
  country: 'India',
  transformerId: 'TRF-A',
  transformerLabel: 'Transformer A',
  timestampLocal: '01/01/2026, 10:00:00',
  reason: 'Verification failed',
};

function renderCard(trace) {
  return render(
    <AdminServer logs={[]} lastTheft={trace} onShareLocation={() => {}} />
  );
}

describe('AdminServer network display (LAC / Cell ID)', () => {
  it('(a) Wi-Fi present: SSID shows, LAC/Cell ID hidden as Unavailable', () => {
    const { container } = renderCard({ ...baseTrace, ssid: 'JioFiber-2.4G', lac: null, cell_id: null });
    const rows = rowsFor(container);
    expect(valueOf(rows, 'WiFi SSID')).toBe('JioFiber-2.4G');
    expect(valueOf(rows, 'LAC')).toBe('Unavailable');
    expect(valueOf(rows, 'Cell ID')).toBe('Unavailable');
    expect(container.textContent).not.toContain('undefined');
  });

  it('(b) Wi-Fi absent + GSM present: SSID Unavailable, LAC/Cell ID render below it', () => {
    const { container } = renderCard({ ...baseTrace, ssid: '', lac: 4057, cell_id: '123456' });
    const rows = rowsFor(container);
    expect(valueOf(rows, 'WiFi SSID')).toBe('Unavailable');
    expect(valueOf(rows, 'LAC')).toBe('4057');
    expect(valueOf(rows, 'Cell ID')).toBe('123456');

    // Layout: LAC and Cell ID sit immediately below the Wi-Fi SSID line.
    const labels = rows.map((r) => r.label);
    expect(labels.indexOf('LAC')).toBe(labels.indexOf('WiFi SSID') + 1);
    expect(labels.indexOf('Cell ID')).toBe(labels.indexOf('WiFi SSID') + 2);
    expect(container.textContent).not.toContain('undefined');
  });

  it('(c) all absent: renders as Unavailable without crashing', () => {
    const { container } = renderCard({ ...baseTrace, ssid: null, lac: null, cell_id: null });
    const rows = rowsFor(container);
    expect(valueOf(rows, 'WiFi SSID')).toBe('Unavailable');
    expect(valueOf(rows, 'LAC')).toBe('Unavailable');
    expect(valueOf(rows, 'Cell ID')).toBe('Unavailable');
    expect(container.textContent).not.toContain('undefined');
  });

  it('(defensive) both present: Wi-Fi wins, GSM hidden, warning logged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = renderCard({ ...baseTrace, ssid: 'JioFiber-2.4G', lac: 4057, cell_id: 123456 });
    const rows = rowsFor(container);
    expect(valueOf(rows, 'WiFi SSID')).toBe('JioFiber-2.4G');
    expect(valueOf(rows, 'LAC')).toBe('Unavailable');
    expect(valueOf(rows, 'Cell ID')).toBe('Unavailable');
    expect(warn).toHaveBeenCalled();
  });
});
