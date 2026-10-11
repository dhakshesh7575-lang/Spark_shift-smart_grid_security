// Regression tests for the EXISTING simulation features.
// These must stay green before and after the sidebar feature is added.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from '../App';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('existing simulation features', () => {
  it('renders the three existing panels', () => {
    render(<App />);
    expect(screen.getByText('ADMIN OFFICE SERVER')).toBeInTheDocument();
    expect(screen.getByText('AUTHORISED METER')).toBeInTheDocument();
    expect(screen.getByText('UNAUTHORISED THIEF CHIP')).toBeInTheDocument();
  });

  it('starts the authorised meter timer at 00:00:30', () => {
    render(<App />);
    expect(screen.getByText('00:00:30')).toBeInTheDocument();
  });

  it('shows the LT breaker cutoff message ONLY after a failed verification', () => {
    render(<App />);
    const msg = /LT BREAKER IN TRANSFORMER STOPPED THE UNAUTHORISED FLOW OF ELECTRICITY/i;

    // Hidden before any verification attempt.
    expect(screen.queryByText(msg)).not.toBeInTheDocument();

    // Shown once the thief VERIFY fails.
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(screen.getByText(msg)).toBeInTheDocument();
  });

  it('thief VERIFY always fails and reveals a trace + enables SHARE LOCATION', () => {
    render(<App />);

    const shareBtn = screen.getByRole('button', { name: /share location/i });
    expect(shareBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    expect(screen.getByText(/THEFT DETECTED/i)).toBeInTheDocument();
    expect(screen.getByText('WiFi SSID')).toBeInTheDocument();
    expect(screen.getByText('BSSID / MAC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share location/i })).toBeEnabled();
  });

  it('SHARE LOCATION shows the confirmation toast', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    fireEvent.click(screen.getByRole('button', { name: /share location/i }));
    expect(screen.getByText('Location shared with authorities.')).toBeInTheDocument();
  });

  it('authorised meter auto-verifies when the 30s countdown hits zero', () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // The success message appears (in the log and/or the meter panel).
    expect(screen.getAllByText(/electricity flow continues/i).length).toBeGreaterThan(0);
  });
});
