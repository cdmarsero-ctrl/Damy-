import Link from "next/link";

/** Closing call to action shared by the information pages. */
export function StartCta({ heading = "Find out where you actually are" }: { heading?: string }) {
  return (
    <aside className="mt-16 surface p-8 text-center">
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-3 text-balance">{heading}</h2>
      <p className="muted max-w-md mx-auto mb-6 text-pretty">
        The placement test adapts to every answer and stops as soon as it knows your level.
        Twelve to twenty-two questions, free.
      </p>
      <Link
        href="/register"
        className="h-11 px-6 inline-flex items-center rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
      >
        Take the placement test
      </Link>
    </aside>
  );
}
