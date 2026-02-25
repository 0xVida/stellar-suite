"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (honeypot) {
      // Silently fail for bots
      setStatus("success");
      setFeedback("Message sent successfully!");
      return;
    }

    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      setStatus("error");
      setFeedback("All fields are required.");
      return;
    }

    if (formData.message.length > 500) {
      setStatus("error");
      setFeedback("Message cannot exceed 500 characters.");
      return;
    }

    setStatus("loading");

    try {
      // Mock API delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      setStatus("success");
      setFeedback("Thank you for your message! We will get back to you soon.");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      setStatus("error");
      setFeedback("Failed to send message. Please try again later.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl rounded-xl border border-border-subtle bg-slate-gray p-8 shadow-md">
      <h2 className="mb-6 text-2xl font-bold text-stardust-white">Contact Us</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Honeypot field - hidden */}
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

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-stardust-white">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Your Name"
              required
              disabled={status === "loading" || status === "success"}
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-stardust-white">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
              required
              disabled={status === "loading" || status === "success"}
            />
          </div>
        </div>

        <div>
          <label htmlFor="subject" className="mb-2 block text-sm font-medium text-stardust-white">
            Subject <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            id="subject"
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="How can we help?"
            required
            disabled={status === "loading" || status === "success"}
          />
        </div>

        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-medium text-stardust-white">
            Message <span className="text-red-400">*</span>
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            rows={5}
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Tell us more..."
            required
            maxLength={500}
            disabled={status === "loading" || status === "success"}
          />
          <p className="mt-1 text-right text-xs text-muted-silver">
            {formData.message.length}/500
          </p>
        </div>

        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          className="flex w-full items-center justify-center rounded-md bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Sending...
            </>
          ) : status === "success" ? (
            "Sent Successfully"
          ) : (
            "Send Message"
          )}
        </button>

        {feedback && (
          <div
            className={`mt-4 rounded-md p-3 text-center text-sm font-medium ${
              status === "error"
                ? "bg-red-900/20 text-red-400"
                : "bg-green-900/20 text-green-400"
            }`}
            role="alert"
          >
            {feedback}
          </div>
        )}
      </form>
    </div>
  );
}
