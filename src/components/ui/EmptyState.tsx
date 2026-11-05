export function EmptyState({title,description}:{title:string;description?:string}) {
  return <div className="rounded-xl border border-dashed border-border bg-zinc-950/30 px-6 py-10 text-center"><p className="text-sm font-medium text-zinc-400">{title}</p>{description&&<p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{description}</p>}</div>;
}
