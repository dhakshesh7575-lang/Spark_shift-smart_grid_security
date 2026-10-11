// src/components/sidebar/TransformerMapPanel.jsx
//
// "Transformer Map" panel shown inside the sidebar drawer. Thin wrapper that
// keeps the drawer header (title + close) consistent with TransformersPanel
// and renders the real Tamil Nadu map (TransformerMap) in the drawer body.

import TransformerMap from './TransformerMap';

export default function TransformerMapPanel({ onClose }) {
  return (
    <div className="transformers-panel">
      <header className="drawer-header">
        <h3 className="drawer-title">TRANSFORMER MAP</h3>
        <span className="drawer-sub">Tamil Nadu grid map</span>
        <button
          type="button"
          className="drawer-close"
          aria-label="Close Transformer Map panel"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="drawer-body tfx-drawer-body">
        <TransformerMap onClose={onClose} />
      </div>
    </div>
  );
}