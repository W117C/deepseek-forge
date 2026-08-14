/** Original abstract Forge / Spark / Agent-Core mark — not the DeepSeek logo. */
export function ForgeMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 2.25 L20.45 7.15 V16.85 L12 21.75 L3.55 16.85 V7.15 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.92"
      />
      <path
        d="M12 4.9 L13.85 10.15 L19.1 12 L13.85 13.85 L12 19.1 L10.15 13.85 L4.9 12 L10.15 10.15 Z"
        fill="var(--accent-bright)"
      />
    </svg>
  )
}
