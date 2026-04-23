import { Link } from 'react-router-dom';
import { KedolikPageFrame } from './KedolikShared';

interface KedolikPlaceholderCard {
  title: string;
  description: string;
}

interface KedolikPlaceholderPageProps {
  badge: string;
  title: string;
  description: string;
  status: string;
  cards: KedolikPlaceholderCard[];
}

export default function KedolikPlaceholderPage({
  badge,
  title,
  description,
  status,
  cards,
}: KedolikPlaceholderPageProps) {
  return (
    <KedolikPageFrame>
      <div className="grid gap-6 lg:grid-cols-[1.3fr,0.7fr]">
        <section className="card p-8 sm:p-10">
          <div className="inline-flex items-center rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
            {badge}
          </div>
          <h1 className="mt-5 text-4xl font-bold font-heading sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-300 sm:text-lg">
            {description}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <div
                key={card.title}
                className="rounded-3xl border border-white/10 bg-dark-900/60 p-5 transition-all duration-300 hover:border-brand-cyan/30 hover:bg-white/5"
              >
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-gray-400">{card.description}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="card p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Status
          </div>
          <div className="mt-3 text-2xl font-bold text-white">{status}</div>
          <p className="mt-3 text-sm leading-relaxed text-gray-300">
            This route is now wired correctly and uses a clean placeholder state instead of a
            broken navigation target.
          </p>

          <div className="mt-6 space-y-3 text-sm text-gray-300">
            <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
              UI shell is active and ready for future feature work.
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
              Styling matches the current Kedolik frontend instead of failing into a missing route.
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link to="/swap" className="btn-primary text-center text-sm">
              Back to Swap
            </Link>
            <Link
              to="/"
              className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-center text-sm font-semibold text-white transition-all duration-300 hover:border-brand-cyan/40 hover:bg-white/10"
            >
              Go Home
            </Link>
          </div>
        </aside>
      </div>
    </KedolikPageFrame>
  );
}
