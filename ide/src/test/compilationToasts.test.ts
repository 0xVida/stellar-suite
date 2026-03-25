import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => {
  return {
    toast: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

import { toast } from "sonner";
import {
  COMPILATION_FAILED_TITLE,
  COMPILATION_SUCCESS_TITLE,
  VIEW_LOGS_ACTION_LABEL,
  showCompilationFailedToast,
  showCompilationSuccessToast,
} from "@/lib/compilationToasts";

describe("compilation toast helpers", () => {
  beforeEach(() => {
    (toast.success as unknown as ReturnType<typeof vi.fn>).mockClear();
    (toast.error as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it("shows a success toast with 3s auto-dismiss", () => {
    showCompilationSuccessToast();

    expect(toast.success).toHaveBeenCalledWith(COMPILATION_SUCCESS_TITLE, { duration: 3000 });
  });

  it("shows a failure toast with View Logs action that expands logs", () => {
    const onViewLogs = vi.fn();

    showCompilationFailedToast({ onViewLogs });

    const [title, opts] = (toast.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      any,
    ];

    expect(title).toBe(COMPILATION_FAILED_TITLE);
    expect(opts).toEqual(
      expect.objectContaining({
        duration: 6500,
        action: expect.objectContaining({
          label: VIEW_LOGS_ACTION_LABEL,
          onClick: expect.any(Function),
        }),
      })
    );

    opts.action.onClick({ preventDefault: vi.fn() });
    expect(onViewLogs).toHaveBeenCalledTimes(1);
  });
});

