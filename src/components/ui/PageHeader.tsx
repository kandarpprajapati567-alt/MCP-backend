export function PageHeader({title,description}:{title:string;description?:string}) {
  return <div className="mb-2"><h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{title}</h1>{description&&<p className="mt-1.5 max-w-2xl text-sm text-zinc-500">{description}</p>}</div>;
}
