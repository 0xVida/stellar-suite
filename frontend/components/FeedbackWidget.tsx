"use client";

import { useState } from "react";
import { MessageSquare, Star, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    setStatus("submitting");

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setStatus("success");
    setTimeout(() => {
      setIsOpen(false);
      setStatus("idle");
      setRating(0);
      setFeedback("");
    }, 2000);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-110 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Open feedback form"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <div className="w-full max-w-md p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-stardust-white">
              We value your feedback
            </h3>
            {/* Close button is handled by Modal component but we can add explicit one if needed, 
                though Modal usually has one. The provided Modal component DOES have a close button. */}
          </div>

          {status === "success" ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-900/20 text-green-400">
                <Star className="h-8 w-8 fill-current" />
              </div>
              <h4 className="text-lg font-medium text-stardust-white">Thank You!</h4>
              <p className="text-muted-silver">Your feedback helps us improve.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex flex-col items-center space-y-2">
                <label className="text-sm font-medium text-muted-silver">
                  How would you rate your experience?
                </label>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="focus:outline-none"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      aria-label={`Rate ${star} out of 5 stars`}
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${
                          star <= (hoverRating || rating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-silver"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="feedback-text"
                  className="mb-2 block text-sm font-medium text-stardust-white"
                >
                  Tell us more (optional)
                </label>
                <textarea
                  id="feedback-text"
                  rows={4}
                  className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="What did you like or dislike?"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-muted-silver hover:text-stardust-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rating === 0 || status === "submitting"}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === "submitting" ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </>
  );
}
