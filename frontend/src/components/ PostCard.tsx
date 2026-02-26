import { formatDate, Post } from "@/lib/post";
import Link from "next/link";

type Props = {
  post: Post;
  featured?: boolean;
};

export function PostCard({ post, featured = false }: Props) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className={`group flex flex-col rounded-2xl border border-border bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 overflow-hidden ${
        featured ? "lg:col-span-2 lg:flex-row" : ""
      }`}
    >
      {/* Color bar accent */}
      <div
        className={`h-1 w-full bg-gradient-to-r from-primary to-accent flex-shrink-0 ${
          featured ? "lg:h-auto lg:w-1" : ""
        }`}
      />

      <div className={`flex flex-col p-6 flex-1 ${featured ? "lg:p-8" : ""}`}>
        {/* Category + reading time */}
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary font-display tracking-wide">
            {post.category}
          </span>
          <span className="text-xs text-muted-foreground font-body">
            {post.readingTime}
          </span>
        </div>

        {/* Title */}
        <h2
          className={`font-display font-bold text-foreground leading-tight group-hover:text-primary transition-colors duration-200 ${
            featured ? "text-2xl lg:text-3xl mb-4" : "text-lg mb-3"
          }`}
        >
          {post.title}
        </h2>

        {/* Excerpt */}
        <p
          className={`font-body text-muted-foreground leading-relaxed flex-1 ${
            featured ? "text-base" : "text-sm"
          }`}
        >
          {post.excerpt}
        </p>

        {/* Footer: date + tags + arrow */}
        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-body">
              {formatDate(post.date)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {post.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
          <span className="flex-shrink-0 text-muted-foreground group-hover:text-primary transition-transform duration-200 group-hover:translate-x-1 transform transition-transform">
            <svg
              width="20"
              height="20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
