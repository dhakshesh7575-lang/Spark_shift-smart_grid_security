// Integration test: TransformersPanel wires City + Status filters together.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TransformersPanel from '../components/sidebar/TransformersPanel';
import { filterTransformers } from '../logic/transformerFilters';
import { TN_TRANSFORMERS } from '../data/tnebTransformers';

describe('TransformersPanel — filters wired together (Step 7)', () => {
  it('prompts to choose a city before showing any list or status row', () => {
    render(<TransformersPanel onClose={() => {}} />);
    expect(screen.getByText(/Choose a city/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'UNAUTHORISED' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('typing "coi" puts Coimbatore directly under the pinned ALL CITIES option', () => {
    render(<TransformersPanel onClose={() => {}} />);
    const input = screen.getByRole('combobox', { name: 'City' });
    fireEvent.change(input, { target: { value: 'coi' } });

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('ALL CITIES'); // pinned at top
    expect(options[1]).toHaveTextContent('Coimbatore'); // best match second
  });

  it('selecting Coimbatore lists only Coimbatore transformers and shows the status row', () => {
    const { container } = render(<TransformersPanel onClose={() => {}} />);
    const input = screen.getByRole('combobox', { name: 'City' });
    fireEvent.change(input, { target: { value: 'coi' } });
    fireEvent.mouseDown(screen.getAllByRole('option')[1]); // Coimbatore

    // Status row appeared.
    expect(screen.getByRole('button', { name: 'ALL' })).toHaveAttribute('aria-pressed', 'true');

    // Every card is a Coimbatore feeder.
    const feederTags = [...container.querySelectorAll('.transformer-card')];
    expect(feederTags.length).toBeGreaterThan(0);
    for (const card of feederTags) {
      expect(card.textContent).toMatch(/Coimbatore/);
    }
  });

  it('combines City = Coimbatore with Status = UNAUTHORISED', () => {
    const expected = filterTransformers(TN_TRANSFORMERS, {
      city: 'Coimbatore',
      status: 'unauthorised',
    });
    const { container } = render(<TransformersPanel onClose={() => {}} />);

    const input = screen.getByRole('combobox', { name: 'City' });
    fireEvent.change(input, { target: { value: 'Coimbatore' } });
    const options = screen.getAllByRole('option');
    fireEvent.mouseDown(options.find((o) => o.textContent === 'Coimbatore'));

    fireEvent.click(screen.getByRole('button', { name: 'UNAUTHORISED' }));

    expect(screen.getByText(`${expected.length} shown`)).toBeInTheDocument();
    expect(container.querySelectorAll('.status-badge--unauthorised').length).toBe(expected.length);
    expect(container.querySelectorAll('.status-badge--authorised').length).toBe(0);
  });

  it('switching to AUTHORISED updates the list immediately', () => {
    const expected = filterTransformers(TN_TRANSFORMERS, {
      city: 'Coimbatore',
      status: 'authorised',
    });
    const { container } = render(<TransformersPanel onClose={() => {}} />);

    const input = screen.getByRole('combobox', { name: 'City' });
    fireEvent.change(input, { target: { value: 'coi' } });
    fireEvent.mouseDown(screen.getAllByRole('option')[1]);

    fireEvent.click(screen.getByRole('button', { name: 'AUTHORISED' }));

    expect(container.querySelectorAll('.status-badge--authorised').length).toBe(expected.length);
    expect(container.querySelectorAll('.status-badge--unauthorised').length).toBe(0);
  });
});