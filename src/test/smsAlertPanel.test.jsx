// Integration tests for the EB-Admin SMS alerts wired into the dashboard.
// Covers the end-to-end simulation flow (no backend, no credentials):
//   1. authorised chip  -> NO alert
//   2. unauthorised chip -> SIMULATED SMS shown (clearly labelled)
//   3. test-alert button -> labelled test alert
//   4. clear button      -> empties the history
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from '../App';
import { SIMULATION_NOTICE } from '../logic/smsAlerts';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe('EB admin SMS alerts (dashboard)', () => {
  it('renders the SMS alert console in SIMULATION mode', () => {
    render(<App />);
    expect(screen.getByText(/EB ADMIN — SMS ALERTS/)).toBeInTheDocument();
    expect(screen.getByText('SIMULATION')).toBeInTheDocument();
    expect(screen.getByText(/ALERT HISTORY \(0\)/)).toBeInTheDocument();
  });

  it('does NOT generate an alert for an authorised meter handshake', () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // The meter verified successfully…
    expect(screen.getAllByText(/electricity flow continues/i).length).toBeGreaterThan(0);
    // …and no SMS alert was produced.
    expect(screen.getByText(/ALERT HISTORY \(0\)/)).toBeInTheDocument();
    expect(screen.queryByText(SIMULATION_NOTICE)).not.toBeInTheDocument();
  });

  it('shows a clearly-labelled SIMULATED SMS after a failed (unauthorised) handshake', () => {
    render(<App />);
    expect(screen.queryByText(SIMULATION_NOTICE)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    expect(screen.getByText(SIMULATION_NOTICE)).toBeInTheDocument();
    expect(screen.getByText(/ALERT HISTORY \(1\)/)).toBeInTheDocument();
    // The message body is the real template, not the hardcoded sample.
    expect(screen.getByText(/ELECTRICITY THEFT ALERT!/)).toBeInTheDocument();
    expect(screen.getByText(/Event: Chip Authentication Failed/)).toBeInTheDocument();
  });

  it('generates a labelled TEST alert from the dashboard button', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /send test alert/i }));

    expect(screen.getByText(/ALERT HISTORY \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/\[TEST ALERT/)).toBeInTheDocument();
    expect(screen.getAllByText(/MTR-TEST-001/).length).toBeGreaterThan(0);
  });

  it('clears the alert history', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(screen.getByText(/ALERT HISTORY \(1\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(screen.getByText(/ALERT HISTORY \(0\)/)).toBeInTheDocument();
    expect(screen.queryByText(SIMULATION_NOTICE)).not.toBeInTheDocument();
  });
});
