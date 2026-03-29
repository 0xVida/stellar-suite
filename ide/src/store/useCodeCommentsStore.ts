import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/utils/idbStorage";

export interface CodeCommentMessage {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  parentId?: string;
}

export interface CodeCommentThread {
  id: string;
  filePath: string;
  line: number;
  commitOid?: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  messages: CodeCommentMessage[];
}

export interface AnnotationHunk {
  startLine: number;
  endLine: number;
  lineDelta: number;
}

interface CodeCommentsState {
  threads: CodeCommentThread[];
  addThread: (input: {
    filePath: string;
    line: number;
    author: string;
    body: string;
    commitOid?: string;
  }) => string;
  addReply: (input: {
    threadId: string;
    author: string;
    body: string;
    parentId?: string;
  }) => void;
  setResolved: (threadId: string, resolved: boolean) => void;
  repositionThreads: (filePath: string, hunks: AnnotationHunk[]) => void;
  clearAll: () => void;
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function applyLineTracking(
  line: number,
  hunks: AnnotationHunk[],
): number {
  let nextLine = line;
  const ordered = [...hunks].sort((a, b) => a.startLine - b.startLine);

  for (const hunk of ordered) {
    if (nextLine < hunk.startLine) {
      continue;
    }

    if (nextLine >= hunk.startLine && nextLine <= hunk.endLine) {
      // If original line falls inside the edited hunk, pin to hunk start then shift.
      nextLine = Math.max(1, hunk.startLine + hunk.lineDelta);
      continue;
    }

    nextLine += hunk.lineDelta;
  }

  return Math.max(1, nextLine);
}

export const useCodeCommentsStore = create<CodeCommentsState>()(
  persist(
    (set) => ({
      threads: [],

      addThread: ({ filePath, line, author, body, commitOid }) => {
        const now = new Date().toISOString();
        const threadId = createId();
        const messageId = createId();

        const thread: CodeCommentThread = {
          id: threadId,
          filePath,
          line: Math.max(1, line),
          commitOid,
          resolved: false,
          createdAt: now,
          updatedAt: now,
          messages: [
            {
              id: messageId,
              author,
              body,
              createdAt: now,
            },
          ],
        };

        set((state) => ({
          threads: [thread, ...state.threads],
        }));

        return threadId;
      },

      addReply: ({ threadId, author, body, parentId }) => {
        const now = new Date().toISOString();
        const reply: CodeCommentMessage = {
          id: createId(),
          author,
          body,
          createdAt: now,
          parentId,
        };

        set((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  updatedAt: now,
                  messages: [...thread.messages, reply],
                }
              : thread,
          ),
        }));
      },

      setResolved: (threadId, resolved) => {
        const now = new Date().toISOString();
        set((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  resolved,
                  updatedAt: now,
                }
              : thread,
          ),
        }));
      },

      repositionThreads: (filePath, hunks) => {
        if (hunks.length === 0) return;

        set((state) => ({
          threads: state.threads.map((thread) => {
            if (thread.filePath !== filePath) {
              return thread;
            }

            return {
              ...thread,
              line: applyLineTracking(thread.line, hunks),
            };
          }),
        }));
      },

      clearAll: () => set({ threads: [] }),
    }),
    {
      name: "stellar-suite:code-comments",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
