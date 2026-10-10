// src/components/sidebar/Sidebar.jsx
//
// Left-hand sidebar: a slim icon rail. The rail is always visible so the
// existing simulation layout is only narrowed, never replaced.
//
// Step 3: only the rail + "Transformers" icon exist here. The drawer/panel
// wiring is added in a later step.

import { TransformerIcon } from './SidebarIcon';

export default function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Sidebar">
      <nav className="sidebar-rail" aria-label="Sidebar sections">
        <button
          type="button"
          className="rail-btn"
          aria-label="Transformers"
          title="Transformers"
        >
          <TransformerIcon />
        </button>
      </nav>
    </aside>
  );
}
