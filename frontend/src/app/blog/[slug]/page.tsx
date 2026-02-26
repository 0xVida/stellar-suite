// src/app/blog/[slug]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "../../../../components/layout/Navbar";
import { Footer } from "../../../../components/layout/Footer";
import { formatDate, getAllPosts, getPostBySlug } from "@/lib/post";
import { PostBody } from "@/components/PostBody";
import { PostCard } from "@/components/ PostCard";

// Static generation: pre-render all slugs at build time
export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

// Per-post metadata
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = getPostBySlug(params.slug);
  if (!post) return {};
  return {
    title: `${post.title} — Stellar Suite Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  const allPosts = getAllPosts();
  const currentIndex = allPosts.findIndex((p) => p.slug === post.slug);
  const related = allPosts
    .filter(
      (p) =>
        p.slug !== post.slug &&
        (p.category === post.category ||
          p.tags.some((t) => post.tags.includes(t))),
    )
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main id="main-content" className="pt-28 pb-20 px-6">
        <div className="mx-auto max-w-3xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 mb-8 text-sm font-body text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <Link
              href="/blog"
              className="hover:text-foreground transition-colors"
            >
              Blog
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-foreground truncate max-w-[200px]">
              {post.title}
            </span>
          </nav>

          {/* Category badge */}
          <div className="mb-5">
            <Link
              href={`/blog?category=${post.category}`}
              className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary font-display tracking-wide hover:bg-primary/20 transition-colors"
            >
              {post.category}
            </Link>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-extrabold text-foreground leading-tight tracking-tight mb-6">
            {post.title}
          </h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 pb-8 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary font-display">
                  {post.author.name[0]}
                </span>
              </div>
              <span className="text-sm font-semibold text-foreground font-body">
                {post.author.name}
              </span>
            </div>
            <span className="text-muted-foreground text-sm font-body">
              {formatDate(post.date)}
            </span>
            <span className="text-muted-foreground text-sm font-body">
              {post.readingTime}
            </span>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-10">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog?tag=${tag}`}
                className="text-xs font-mono text-muted-foreground border border-border rounded px-2 py-1 hover:border-primary/40 hover:text-primary transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </div>

          {/* Excerpt (lead) */}
          <p className="text-lg font-body text-muted-foreground leading-relaxed mb-10 pb-10 border-b border-border">
            {post.excerpt}
          </p>

          {/* Post content */}
          <PostBody content={post.content} />

          {/* Post nav: prev/next */}
          <div className="mt-16 pt-8 border-t border-border flex items-center justify-between gap-4">
            {currentIndex < allPosts.length - 1 ? (
              <Link
                href={`/blog/${allPosts[currentIndex + 1].slug}`}
                className="group flex items-center gap-2 text-sm font-body text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="group-hover:-translate-x-0.5 transition-transform"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 16l-4-4m0 0l4-4m-4 4h18"
                  />
                </svg>
                <span className="truncate max-w-[200px]">
                  {allPosts[currentIndex + 1].title}
                </span>
              </Link>
            ) : (
              <div />
            )}
            {currentIndex > 0 ? (
              <Link
                href={`/blog/${allPosts[currentIndex - 1].slug}`}
                className="group flex items-center gap-2 text-sm font-body text-muted-foreground hover:text-foreground transition-colors text-right"
              >
                <span className="truncate max-w-[200px]">
                  {allPosts[currentIndex - 1].title}
                </span>
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="group-hover:translate-x-0.5 transition-transform"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
            ) : (
              <div />
            )}
          </div>

          {/* Back to blog */}
          <div className="mt-8 text-center">
            <Link href="/blog" className="btn-outline text-sm">
              ← Back to Blog
            </Link>
          </div>
        </div>

        {/* Related posts */}
        {related.length > 0 && (
          <div className="mx-auto max-w-6xl mt-20 pt-12 border-t border-border">
            <h2 className="text-xl font-display font-bold text-foreground mb-8">
              Related Posts
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {related.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
