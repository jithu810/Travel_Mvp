export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-brand uppercase">{eyebrow}</p>
      <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 text-base leading-7 text-stone-600">{description}</p>
    </div>
  );
}
