// src/components/sidebar/StatusFilter.jsx
//
// SECONDARY FILTER ROW — three side-by-side toggle buttons that filter the
// transformer list by authorisation status. Default selection is "ALL".
// Selecting a button applies the filter immediately; only one is active at a
// time. This is a separate *category* in the shared filter state, so it can be
// combined with the City filter (and any future categories) via
// filterTransformers().

import { STATUS_OPTIONS } from '../../logic/transformerFilters';

export default function StatusFilter({ value = 'all', onChange }) {
  return (
    <div className="status-filter" role="group" aria-label="Transformer status filter">
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`status-toggle status-toggle--${opt.value}${value === opt.value ? ' is-active' : ''}`}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}