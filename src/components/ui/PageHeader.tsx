export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="page-heading mb-6 border-b border-white/[0.06] pb-5">
      <p className="mb-2 text-[9px] font-bold uppercase tracking-[.24em] text-teal-300/75">Futuristic System / Workspace</p>
      <h1 className="text-2xl font-semibold tracking-[-.035em] text-white sm:text-[30px]">{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>}
    </div>
  );
}
