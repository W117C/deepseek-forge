interface PlaceholderProps {
  title: string;
  phase: string;
}

export default function Placeholder({ title, phase }: PlaceholderProps) {
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{title}</h1>
      </header>
      <div className="empty-state placeholder-state">
        <h3>{title} is not available yet</h3>
        <p>
          This module ships in {phase} of the Desktop-first migration. It has no
          functionality in Phase 2.
        </p>
      </div>
    </div>
  );
}
