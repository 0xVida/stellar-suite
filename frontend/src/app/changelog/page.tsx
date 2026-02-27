import { changelogData } from "@/lib/data/changelog";

export default function ChangelogPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl flex-col py-32 px-6">
        <header className="mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
            Changelog
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Version history and release notes for the Stellar Kit extension (prev. Stellar Suite). MVP screenshots may show the former name in the UI.
          </p>
        </header>

        <div className="space-y-16">
          {changelogData.map((release) => (
            <section key={release.version} className="relative pl-8 before:absolute before:left-0 before:top-2 before:h-full before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
              <div className="absolute left-[-4px] top-2 h-2 w-2 rounded-full bg-zinc-900 ring-4 ring-white dark:bg-zinc-50 dark:ring-black" />
              
              <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <h2 className="text-2xl font-bold text-black dark:text-zinc-50">
                  v{release.version}
                </h2>
                <time className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
                  {release.date === "—"
                    ? "Unreleased"
                    : new Date(release.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                </time>
              </div>

              <div className="space-y-8">
                {release.entries.map((entry, idx) => (
                  <div key={idx}>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                      ${entry.type === 'Added' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : ''}
                      ${entry.type === 'Fixed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : ''}
                      ${entry.type === 'Changed' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                      ${entry.type === 'Breaking' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : ''}
                    `}>
                      {entry.type}
                    </span>
                    <ul className="mt-4 space-y-2">
                      {entry.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
