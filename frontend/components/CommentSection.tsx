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
      date: "Yesterday",
    },
    {
      id: 2,
      author: "Cosmic User",
      text: "The new UI is very clean. Good job!",
      date: "2 days ago",
    },
  ]);

  const [newComment, setNewComment] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModerator, setIsModerator] = useState(false);

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
    <div className="rounded-xl border border-border-subtle bg-slate-gray p-4 sm:p-6">
      <h3 className="mb-4 text-lg font-semibold text-stardust-white sm:mb-6 sm:text-xl">
        Comments ({comments.length})
      </h3>

      <form onSubmit={handleSubmit} className="mb-6 space-y-3 sm:mb-8 sm:space-y-4">
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
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-3 py-2 text-sm text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:px-4 sm:text-base"
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
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-3 py-2 text-sm text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:px-4 sm:text-base"
            required
            disabled={isSubmitting}
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !newComment.trim() || !authorName.trim()}
          className="flex items-center rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
        >
          {isSubmitting ? "Posting..." : "Post Comment"}
          {!isSubmitting && <Send className="ml-2 h-4 w-4" />}
        </button>
      </form>
      {/* moderator toggle for demonstration */}
      <div className="mt-4 flex items-center gap-2">
        <input
          type="checkbox"
          id="moderator"
          checked={isModerator}
          onChange={(e) => setIsModerator(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="moderator" className="text-sm text-muted-silver">
          Moderator mode (show delete buttons)
        </label>
      </div>

      <div className="space-y-6">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-cosmic-navy text-muted-silver">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-stardust-white">
                    {comment.author}
                  </span>
                  <span className="text-xs text-muted-silver">
                    {comment.date}
                  </span>
                </div>
                {isModerator && (
                  <button
                    onClick={() =>
                      setComments((prev) => prev.filter((c) => c.id !== comment.id))
                    }
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-1 text-muted-silver">{comment.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
