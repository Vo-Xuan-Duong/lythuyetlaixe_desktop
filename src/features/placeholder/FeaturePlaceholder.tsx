interface FeaturePlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function FeaturePlaceholder({ eyebrow, title, description }: FeaturePlaceholderProps) {
  return (
    <div className="page placeholder-page">
      <section className="placeholder-card">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="phase-badge">Được triển khai ở phase tiếp theo</div>
      </section>
    </div>
  );
}
