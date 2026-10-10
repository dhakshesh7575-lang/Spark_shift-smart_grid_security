// src/components/sidebar/TransformerList.jsx
//
// Renders the filtered transformer cards. Handles the empty state with a
// friendly message naming the selected city.

export default function TransformerList({ transformers, cityLabel }) {
  if (!transformers.length) {
    return (
      <div className="transformer-empty" role="status">
        No transformers found in {cityLabel || 'the selected location'}.
      </div>
    );
  }

  return (
    <ul className="transformer-list">
      {transformers.map((t) => (
        <li key={t.id} className="transformer-card">
          <div className="transformer-card-head">
            <span className="transformer-name" title={t.name}>
              {t.name}
            </span>
            <span className={`status-badge status-badge--${t.status}`}>
              {t.status.toUpperCase()}
            </span>
          </div>
          <div className="transformer-meta">
            <span>ID {t.id}</span>
            <span>{t.capacityKva} kVA</span>
            <span>{t.feeder}</span>
          </div>
          <div className="transformer-meta">
            <span>
              {t.city}, {t.district} dist.
            </span>
            <span>inspected {t.lastInspected}</span>
            <span className="geo">{t.location.lat.toFixed(3)}, {t.location.lng.toFixed(3)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}