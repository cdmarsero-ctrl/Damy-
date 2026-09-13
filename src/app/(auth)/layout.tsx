import Link from "next/link";

/** Split layout: form on the left, positioning on the right. The marketing
 *  panel is hidden below `lg` so the form is never pushed below the fold. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <Link href="/" className="flex items-center gap-2.5 font-semibold mb-10 w-fit">
          <span className="size-9 rounded-lg bg-brand-600 text-white grid place-items-center text-sm font-bold">
            Lx
          </span>
          <span className="text-lg">Lexicon</span>
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </div>

      <div className="hidden lg:flex flex-col justify-center px-16 bg-[var(--surface-sunken)] border-l border-[var(--border)]">
        <blockquote className="max-w-md">
          <p className="font-serif text-2xl leading-relaxed text-balance">
            “The limits of my language mean the limits of my world.”
          </p>
          <footer className="mt-4 text-sm muted">Ludwig Wittgenstein, <cite>Tractatus</cite>, 5.6</footer>
        </blockquote>

        <div className="mt-12 space-y-5 max-w-md">
          {[
            {
              title: "Placed properly, in twelve questions",
              body: "An adaptive test that stops as soon as it knows your level — not after forty questions you did not need.",
            },
            {
              title: "Feedback that says why",
              body: "Every correction explains the principle behind it. Corrections you cannot generalise from are worth very little.",
            },
            {
              title: "Built for the last mile",
              body: "Register, connotation, implicature and rhetorical control — the things that separate accurate English from native English.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h2 className="font-semibold text-sm mb-1">{item.title}</h2>
              <p className="text-sm muted text-pretty">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
