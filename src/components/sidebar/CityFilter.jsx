// src/components/sidebar/CityFilter.jsx
//
// Filter #1 — CITY. Supports BOTH input styles:
//   (a) manual typing with live autocomplete (matches appear as you type,
//       prefix matches first, best match at the very top), and
//   (b) a dropdown that opens the preloaded full list.
// The "ALL CITIES" option is permanently pinned at the top of the list.
//
// Keyboard: ArrowUp/ArrowDown navigate, Enter selects, Escape closes.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_CITIES,
  ALL_CITIES_LABEL,
  buildCitySuggestions,
  getCityNames,
} from '../../logic/transformerFilters';

const CITY_NAMES = getCityNames();

/** Display label for a stored filter value. */
function labelOf(value) {
  return value === ALL_CITIES ? ALL_CITIES_LABEL : value ?? '';
}

export default function CityFilter({ value, onSelect, disabled = false }) {
  const [text, setText] = useState(() => labelOf(value));
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef(null);

  // Keep the input in sync if the parent changes the selection externally.
  useEffect(() => {
    setText(labelOf(value));
  }, [value]);

  // Suggestion list recomputed on every keystroke / open state change.
  const matches = useMemo(
    () => (open ? buildCitySuggestions(CITY_NAMES, text) : []),
    [open, text]
  );

  // Close when the user clicks anywhere outside this control.
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  /** Commit a chosen option (value of the suggestion). */
  const commit = (candidate) => {
    onSelect(candidate);
    setText(labelOf(candidate));
    setOpen(false);
    setHighlighted(0);
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlighted(0);
        } else {
          setHighlighted((h) => (h + 1) % matches.length);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlighted(matches.length - 1);
        } else {
          setHighlighted((h) => (h - 1 + matches.length) % matches.length);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (open && matches[highlighted] != null) commit(matches[highlighted]);
        break;
      case 'Escape':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="city-filter" ref={containerRef}>
      <div className="city-filter-row">
        <input
          type="text"
          className="city-input"
          role="combobox"
          aria-expanded={open}
          aria-controls="city-suggestions"
          aria-activedescendant={open ? `city-opt-${highlighted}` : undefined}
          aria-label="City"
          placeholder="Type or pick a city…"
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="city-dropdown-btn"
          aria-label={open ? 'Close city list' : 'Open city list'}
          onClick={() => {
            setOpen((o) => !o);
            setHighlighted(0);
          }}
        >
          ▾
        </button>
      </div>

      {open && matches.length > 0 && (
        <ul className="city-suggestions" id="city-suggestions" role="listbox" aria-label="City suggestions">
          {matches.map((m, i) => (
            <li
              key={m}
              id={`city-opt-${i}`}
              role="option"
              aria-selected={i === highlighted}
              className={`city-option${i === highlighted ? ' is-highlighted' : ''}${m === ALL_CITIES ? ' is-all' : ''}`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in the input
                commit(m);
              }}
            >
              <span>{labelOf(m)}</span>
              {m === ALL_CITIES && <span className="city-option-tag">ALL TN</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}