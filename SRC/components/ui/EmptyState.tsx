export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-raised/50 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      )}
    </div>
  );
}

