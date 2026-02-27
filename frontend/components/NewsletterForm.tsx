"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Spam protection: honeypot check
    if (honeypot) {
      // Silently fail for bots
      setStatus("success");
      setMessage("Thank you for subscribing!");
      return;
    }

    // Basic validation
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }

    setStatus("loading");

    // Simulate API call
    try {
      // Mock API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Here we would POST to /api/newsletter
      // const res = await fetch('/api/newsletter', { method: 'POST', body: JSON.stringify({ email }) });
      
      setStatus("success");
      setMessage("Thank you for subscribing! Check your inbox for confirmation.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again later.");
    }
  };

  return (
    <div className="w-full max-w-md rounded-lg border border-border-subtle bg-slate-gray p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-stardust-white">Subscribe to our Newsletter</h3>
      <p className="mt-2 text-sm text-muted-silver">
        Get the latest updates on Stellar Kit features and ecosystem news.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {/* Honeypot field - hidden from real users */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            type="text"
            id="website"
            name="website"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={status === "loading" || status === "success"}
            required
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Subscribing...
            </>
          ) : status === "success" ? (
            "Subscribed!"
          ) : (
            "Subscribe"
          )}
        </button>

        {message && (
          <p
            className={`mt-2 text-sm ${
              status === "error" ? "text-red-400" : "text-green-400"
            }`}
            role="alert"
          >
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
