export interface ContentItem {
  id: string;
  type: "template" | "feature" | "guide";
  title: string;
  description: string;
  tags: string[];
  category: string;
  keywords: string[];
  body?: string;
  codeSnippet?: string;
  icon?: string;
}

import { TEMPLATE_CONTENT } from "./templates";
import { FEATURE_CONTENT } from "./features";
import { GUIDE_CONTENT } from "./guides";

export const ALL_CONTENT: ContentItem[] = [
  ...TEMPLATE_CONTENT,
  ...FEATURE_CONTENT,
  ...GUIDE_CONTENT,
];
