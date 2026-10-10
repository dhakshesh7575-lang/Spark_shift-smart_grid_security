// End-to-end test: sidebar icon opens the Transformers panel from the real app
// (Step 8), without breaking the existing simulation.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

describe('sidebar end-to-end', () => {
  it('opens the Transformers panel from the rail icon, simulation stays intact', () => {
    render(<App />);

    // Existing simulation before opening.
    expect(screen.getByText('ADMIN OFFICE SERVER')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Transformers' }));

    expect(screen.getByRole('heading', { name: 'TRANSFORMERS' })).toBeInTheDocument();
    expect(screen.getByText(/Choose a city/i)).toBeInTheDocument();

    // Simulation is still fully present while the drawer is open.
    expect(screen.getByText('ADMIN OFFICE SERVER')).toBeInTheDocument();
    expect(screen.getByText('AUTHORISED METER')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
  });

  it('closes the panel with the ✕ button', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Transformers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Transformers panel' }));

    expect(screen.queryByRole('heading', { name: 'TRANSFORMERS' })).not.toBeInTheDocument();
    expect(screen.getByText('ADMIN OFFICE SERVER')).toBeInTheDocument();
  });

  it('toggles the panel by clicking the rail icon again', () => {
    render(<App />);
    const rail = screen.getByRole('button', { name: 'Transformers' });

    fireEvent.click(rail);
    expect(screen.getByRole('heading', { name: 'TRANSFORMERS' })).toBeInTheDocument();

    fireEvent.click(rail);
    expect(screen.queryByText(/Choose a city/i)).not.toBeInTheDocument();
  });
});