import { toast } from "sonner";

export const COMPILATION_SUCCESS_TITLE = "Compilation Successful";
export const COMPILATION_FAILED_TITLE = "Compilation Failed";
export const VIEW_LOGS_ACTION_LABEL = "View Logs";

export function showCompilationSuccessToast() {
  toast.success(COMPILATION_SUCCESS_TITLE, { duration: 3000 });
}

export function showCompilationFailedToast({ onViewLogs }: { onViewLogs: () => void }) {
  toast.error(COMPILATION_FAILED_TITLE, {
    duration: 6500,
    action: {
      label: VIEW_LOGS_ACTION_LABEL,
      onClick: (event) => {
        event.preventDefault();
        onViewLogs();
      },
    },
  });
}

