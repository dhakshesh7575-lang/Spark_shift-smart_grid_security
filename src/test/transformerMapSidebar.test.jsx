// Step 1 tests: the new "Transformer Map" sidebar entry sits IMMEDIATELY below
// "Transformers", opens a placeholder panel without crashing, and does not
// disturb the existing sidebar entries.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

describe('sidebar — Transformer Map entry (Step 1)', () => {
  it('renders Transformer Map directly BELOW Transformers on the rail', () => {
    const { container } = render(<App />);
    const railButtons = [...container.querySelectorAll('.sidebar-rail .rail-btn')];
    const labels = railButtons.map((b) => b.getAttribute('aria-label'));

    expect(labels).toContain('Transformers');
    expect(labels).toContain('Transformer Map');
    // IMMEDIATELY below — nothing in between, not above, not floating.
    expect(labels.indexOf('Transformer Map')).toBe(labels.indexOf('Transformers') + 1);
  });

  it('clicking Transformer Map opens the map panel and keeps the simulation intact', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Transformer Map' }));

    expect(screen.getByRole('heading', { name: 'TRANSFORMER MAP' })).toBeInTheDocument();
    // Map chrome renders (status chips + map canvas).
    expect(screen.getByRole('group', { name: 'Transformer status filter' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Tamil Nadu transformer map/i)).toBeInTheDocument();

    // Simulation is still fully present while the drawer is open.
    expect(screen.getByText('ADMIN OFFICE SERVER')).toBeInTheDocument();
    expect(screen.getByText('AUTHORISED METER')).toBeInTheDocument();
  });

  it('closes the map panel with the ✕ button', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Transformer Map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Transformer Map panel' }));

    expect(screen.queryByRole('heading', { name: 'TRANSFORMER MAP' })).not.toBeInTheDocument();
  });

  it('existing Transformers entry still opens and closes independently', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Transformers' }));
    expect(screen.getByRole('heading', { name: 'TRANSFORMERS' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Transformers panel' }));
    expect(screen.queryByRole('heading', { name: 'TRANSFORMERS' })).not.toBeInTheDocument();

    // New entry unaffected / still present.
    expect(screen.getByRole('button', { name: 'Transformer Map' })).toBeInTheDocument();
  });

  it('only one drawer is open at a time (panels toggle independently)', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Transformers' }));
    expect(screen.getByRole('heading', { name: 'TRANSFORMERS' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Transformer Map' }));

    expect(screen.queryByRole('heading', { name: 'TRANSFORMERS' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TRANSFORMER MAP' })).toBeInTheDocument();
  });
});