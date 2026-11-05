import { cn } from "@/lib/utils";

export function Card({children,className}:{children:React.ReactNode;className?:string}) {
  return <div className={cn("rounded-2xl border border-border bg-surface-raised/90 p-5 shadow-sm sm:p-6",className)}>{children}</div>;
}

export function CardHeader({title,description,action}:{title:string;description?:string;action?:React.ReactNode}) {
  return <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-zinc-100">{title}</h3>{description&&<p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>}</div>{action}</div>;
}
