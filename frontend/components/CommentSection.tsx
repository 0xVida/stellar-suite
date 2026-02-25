"use client";

import { useState } from "react";
import { User, Send } from "lucide-react";

interface Comment {
  id: number;
  author: string;
  text: string;
  date: string;
}

export function CommentSection() {
  const [comments, setComments] = useState<Comment[]>([
    {
      id: 1,
      author: "Stellar Dev",
      text: "Great update! Looking forward to using the new features.",
      date: new Date(Date.now() - 86400000).toLocaleDateString(),
    },
    {
      id: 2,
      author: "Cosmic User",
      text: "The new UI is very clean. Good job!",
      date: new Date(Date.now() - 172800000).toLocaleDateString(),
    },
  ]);

  const [newComment, setNewComment] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !authorName.trim()) return;

    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 800));

    const comment: Comment = {
      id: Date.now(),
      author: authorName,
      text: newComment,
      date: new Date().toLocaleDateString(),
    };

    setComments((prev) => [comment, ...prev]);
    setNewComment("");
    // Keep author name for convenience
    setIsSubmitting(false);
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-slate-gray p-6">
      <h3 className="mb-6 text-xl font-semibold text-stardust-white">
        Comments ({comments.length})
      </h3>

      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        <div>
          <label htmlFor="author" className="sr-only">
            Name
          </label>
          <input
            type="text"
            id="author"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Your Name"
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
            disabled={isSubmitting}
          />
        </div>
        <div>
          <label htmlFor="comment" className="sr-only">
            Comment
          </label>
          <textarea
            id="comment"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
            disabled={isSubmitting}
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !newComment.trim() || !authorName.trim()}
          className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Posting..." : "Post Comment"}
          {!isSubmitting && <Send className="ml-2 h-4 w-4" />}
        </button>
      </form>

      <div className="space-y-6">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-cosmic-navy text-muted-silver">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-stardust-white">
                  {comment.author}
                </span>
                <span className="text-xs text-muted-silver">{comment.date}</span>
              </div>
              <p className="mt-1 text-muted-silver">{comment.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
