export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="page-heading">
      <p className="eyebrow">Futuristic System <span className="px-1 text-stone-600">/</span> Workspace</p>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
