"use client";

import { useEffect, useState } from "react";

interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

export function ContributorRecognition() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // fetch the top contributors from GitHub
    fetch("/api/contributors")
      .then((res) => {
        if (!res.ok) throw new Error("Network response not ok");
        return res.json();
      })
      .then((data) => {
        setContributors(data.slice(0, 10));
      })
      .catch((err) => {
        console.error(err);
        setError("Unable to load contributors.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-silver">Loading contributors…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (contributors.length === 0) {
    return <p className="text-sm text-muted-silver">No contributors found.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 md:gap-4 lg:grid-cols-6">
      {contributors.map((c) => (
        <a
          key={c.login}
          href={c.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center space-y-1 text-center"
        >
          <img
            src={c.avatar_url}
            alt={c.login}
            className="h-12 w-12 rounded-full sm:h-14 sm:w-14 md:h-16 md:w-16"
          />
          <span className="text-xs text-stardust-white sm:text-sm">{c.login}</span>
        </a>
      ))}
    </div>
  );
}
