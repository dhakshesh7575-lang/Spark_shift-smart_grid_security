// src/components/sidebar/SidebarIcon.jsx
//
// Small, minimal inline SVG icons for the left sidebar rail. No icon library
// or CDN is used — everything is plain SVG that inherits the current colour.

/**
 * "Transformers" rail icon — a compact distribution transformer with a
 * lightning bolt, matching the app's electrical theme.
 */
export function TransformerIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M13 6.5 8.5 13H12l-1 4.5L15.5 11H12z" />
    </svg>
  );
}

/**
 * "Transformer Map" rail icon — a folded map with a location pin dot.
 * Rounded outline + two vertical fold lines + centred pin, matching the
 * TransformerIcon stroke weight and currentColor usage.
 */
export function MapIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8.5 3v18" />
      <path d="M15.5 3v18" />
      <circle cx="12" cy="12" r="1.7" />
    </svg>
  );
}

export default TransformerIcon;
