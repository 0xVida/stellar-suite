"use client";

import { useState, useEffect } from "react";
import { Twitter, Linkedin, Link as LinkIcon, Check } from "lucide-react";

interface SocialShareButtonsProps {
  title: string;
  url?: string;
}

export function SocialShareButtons({ title, url }: SocialShareButtonsProps) {
  const [shareUrl, setShareUrl] = useState(url || "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !url) {
      setShareUrl(window.location.href);
    }
  }, [url]);

  const shareLinks = [
    {
      name: "Twitter",
      icon: Twitter,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        title
      )}&url=${encodeURIComponent(shareUrl)}`,
      color: "hover:text-[#1DA1F2]",
    },
    {
      name: "LinkedIn",
      icon: Linkedin,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
        shareUrl
      )}`,
      color: "hover:text-[#0A66C2]",
    },
  ];

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  return (
    <div className="flex items-center space-x-4">
      <span className="text-sm font-medium text-muted-silver">Share this:</span>
      <div className="flex space-x-2">
        {shareLinks.map((link) => (
          <a
            key={link.name}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-full bg-slate-gray p-2 text-stardust-white transition-colors hover:bg-cosmic-navy ${link.color}`}
            aria-label={`Share on ${link.name}`}
          >
            <link.icon className="h-5 w-5" />
          </a>
        ))}
        <button
          onClick={handleCopyLink}
          className="rounded-full bg-slate-gray p-2 text-stardust-white transition-colors hover:bg-cosmic-navy hover:text-green-400"
          aria-label="Copy link"
          title="Copy link"
        >
          {copied ? (
            <Check className="h-5 w-5" />
          ) : (
            <LinkIcon className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
