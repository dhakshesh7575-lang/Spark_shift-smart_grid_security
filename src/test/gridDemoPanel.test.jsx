// Integration tests for the Smart Grid Security DEMO panel wired into App.
// The whole flow runs with no backend and no credentials (DEMO mode).
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from '../App';
import { ALERT_STATUS } from '../logic/gridDemo';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Click a demo control by its visible label. */
function clickControl(name) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('Grid Security DEMO panel', () => {
  it('renders the demo panel with a clear DEMO MODE label', () => {
    render(<App />);
    expect(screen.getByText('GRID SECURITY DEMO')).toBeInTheDocument();
    expect(screen.getByText('DEMO MODE')).toBeInTheDocument();
    expect(screen.getByText(/ALERT RECORDS \(0\)/)).toBeInTheDocument();
  });

  it('a NORMAL reading raises no alert', () => {
    render(<App />);
    clickControl(/normal reading/i);

    expect(screen.getByText(/ALERT RECORDS \(0\)/)).toBeInTheDocument();
    // The reading chip reads exactly "NORMAL" (the button is "NORMAL READING").
    expect(screen.getByText('NORMAL')).toBeInTheDocument();
  });

  it('a SUSPECT THEFT reading creates a truthful DEMO alert record', () => {
    render(<App />);
    clickControl(/suspect theft/i);

    expect(screen.getByText(/ALERT RECORDS \(1\)/)).toBeInTheDocument();
    // The exact required SMS body is rendered.
    expect(screen.getByText(/ALERT: Suspected electricity theft\./)).toBeInTheDocument();
    expect(screen.getByText(/Reading: \d+\.\d+ \(SIMULATED\)/)).toBeInTheDocument();
    // The offline queue is untouched and the status is truthful.
    expect(screen.getByText(ALERT_STATUS.DEMO_NOT_SENT)).toBeInTheDocument();
    expect(screen.getByText(/QUEUE: 0/)).toBeInTheDocument();
  });

  it('a theft while offline is queued, and restored connectivity flushes it', () => {
    render(<App />);

    clickControl(/wi-fi \/ backend down/i);
    expect(screen.getByText(/WI-FI \/ BACKEND: DOWN/)).toBeInTheDocument();

    clickControl(/suspect theft/i);
    expect(screen.getByText(ALERT_STATUS.QUEUED_OFFLINE)).toBeInTheDocument();
    expect(screen.getByText(/QUEUE: 1/)).toBeInTheDocument();
    expect(screen.getByText(/IN OFFLINE QUEUE/)).toBeInTheDocument();

    clickControl(/restore connectivity/i);
    // After flush the alert is no longer queued and is honestly "not sent".
    expect(screen.getByText(/QUEUE: 0/)).toBeInTheDocument();
    expect(screen.getByText(ALERT_STATUS.DEMO_NOT_SENT)).toBeInTheDocument();
  });

  it('the SMS FALLBACK control reports there is nothing queued', () => {
    render(<App />);
    clickControl(/sms fallback/i);
    expect(screen.getByText(/no queued alerts to deliver/i)).toBeInTheDocument();
  });

  it('acknowledging an alert marks it processed', () => {
    render(<App />);
    clickControl(/suspect theft/i);
    clickControl(/acknowledge/i);
    expect(screen.getByText(/ACKNOWLEDGED/)).toBeInTheDocument();
  });

  it('clears the alert records', () => {
    render(<App />);
    clickControl(/suspect theft/i);
    expect(screen.getByText(/ALERT RECORDS \(1\)/)).toBeInTheDocument();

    clickControl(/clear all/i);
    expect(screen.getByText(/ALERT RECORDS \(0\)/)).toBeInTheDocument();
  });
});
