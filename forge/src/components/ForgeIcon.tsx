/** Original Forge mark: an anvil struck by a spark, drawn as a stroke-based glyph. */
export function ForgeIcon({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 3.5l1.9 2.2-3.8 2.6 3.8 2.6-3.8 2.6 3.8 2.6-3.8 2.6 3.8 2.6-1.9 2.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 21.5h17l1.2 1.6-2.6 4.2a2 2 0 0 1-1.7 1H10.6a2 2 0 0 1-1.7-1l-2.6-4.2 1.2-1.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M10.4 21.5v-1.4c0-1.2 1-2.2 2.2-2.2h6.8c1.2 0 2.2 1 2.2 2.2v1.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact square version used inside package cards. */
export function ForgeMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <ForgeIcon size={size} className={className} />;
}
