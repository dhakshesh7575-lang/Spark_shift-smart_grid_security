// src/components/sidebar/Sidebar.jsx
//
// Left-hand sidebar: a slim icon rail that opens a compact drawer panel
// inside the sidebar area (NOT a full-page route). The rail is always visible,
// so the existing simulation layout is only narrowed, never replaced.
//
// State is intentionally local to the sidebar so the simulation's App-level
// state is untouched.

import { useState } from 'react';
import { MapIcon, TransformerIcon } from './SidebarIcon';
import TransformersPanel from './TransformersPanel';
import TransformerMapPanel from './TransformerMapPanel';

export default function Sidebar() {
  // Which section is open in the drawer (null = collapsed, rail only).
  const [activeSection, setActiveSection] = useState(null);

  const toggle = (section) =>
    setActiveSection((current) => (current === section ? null : section));

  return (
    <aside className={`sidebar${activeSection ? ' is-open' : ''}`} aria-label="Sidebar">
      <nav className="sidebar-rail" aria-label="Sidebar sections">
        <button
          type="button"
          className={`rail-btn${activeSection === 'transformers' ? ' is-active' : ''}`}
          aria-label="Transformers"
          title="Transformers"
          aria-pressed={activeSection === 'transformers'}
          onClick={() => toggle('transformers')}
        >
          <TransformerIcon />
        </button>

        <button
          type="button"
          className={`rail-btn${activeSection === 'transformerMap' ? ' is-active' : ''}`}
          aria-label="Transformer Map"
          title="Transformer Map"
          aria-pressed={activeSection === 'transformerMap'}
          onClick={() => toggle('transformerMap')}
        >
          <MapIcon />
        </button>
      </nav>

      {activeSection === 'transformers' && (
        <section className="sidebar-drawer" aria-label="Transformers">
          <TransformersPanel onClose={() => setActiveSection(null)} />
        </section>
      )}

      {activeSection === 'transformerMap' && (
        <section className="sidebar-drawer" aria-label="Transformer Map">
          <TransformerMapPanel onClose={() => setActiveSection(null)} />
        </section>
      )}
    </aside>
  );
}