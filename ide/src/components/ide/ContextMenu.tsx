"use client";

import { type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Download,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  X,
  XCircle,
  XSquare,
} from "lucide-react";

// ─── ExplorerContextMenu ──────────────────────────────────────────────────────

export interface ExplorerContextMenuProps {
  children: ReactNode;
  path: string[];
  isFolder: boolean;
  onNewFile?: (parentPath: string[]) => void;
  onNewFolder?: (parentPath: string[]) => void;
  onRename?: (path: string[]) => void;
  onDelete?: (path: string[]) => void;
  onDownload?: (path: string[]) => void;
}

/**
 * Right-click context menu for file explorer nodes.
 *
 * Wraps any element with a Radix-powered context menu that exposes
 * file/folder operations.  Keyboard navigation (ArrowUp/Down, Enter,
 * Escape) is provided by Radix UI out of the box.
 */
export function ExplorerContextMenu({
  children,
  path,
  isFolder,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onDownload,
}: ExplorerContextMenuProps) {
  const hasCreationActions = isFolder && (onNewFile || onNewFolder);
  const hasEditActions = onRename || (!isFolder && onDownload);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {isFolder && onNewFile && (
          <ContextMenuItem
            onClick={() => onNewFile(path)}
            className="gap-2 text-xs"
          >
            <FilePlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            New File
            <ContextMenuShortcut>N</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {isFolder && onNewFolder && (
          <ContextMenuItem
            onClick={() => onNewFolder(path)}
            className="gap-2 text-xs"
          >
            <FolderPlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            New Folder
          </ContextMenuItem>
        )}

        {hasCreationActions && hasEditActions && <ContextMenuSeparator />}

        {onRename && (
          <ContextMenuItem
            onClick={() => onRename(path)}
            className="gap-2 text-xs"
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Rename
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {!isFolder && onDownload && (
          <ContextMenuItem
            onClick={() => onDownload(path)}
            className="gap-2 text-xs"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Download
          </ContextMenuItem>
        )}

        {(hasCreationActions || hasEditActions) && onDelete && (
          <ContextMenuSeparator />
        )}

        {onDelete && (
          <ContextMenuItem
            onClick={() => onDelete(path)}
            className="gap-2 text-xs text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Delete
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ─── TabContextMenu ───────────────────────────────────────────────────────────

export interface TabContextMenuProps {
  children: ReactNode;
  path: string[];
  onClose?: (path: string[]) => void;
  onCloseOthers?: (path: string[]) => void;
  onCloseAll?: () => void;
  onRename?: (path: string[]) => void;
  onDownload?: (path: string[]) => void;
}

/**
 * Right-click context menu for editor tabs.
 *
 * Exposes close variants (this tab, others, all) plus rename and
 * download actions.  Keyboard navigation is handled by Radix UI.
 */
export function TabContextMenu({
  children,
  path,
  onClose,
  onCloseOthers,
  onCloseAll,
  onRename,
  onDownload,
}: TabContextMenuProps) {
  const hasCloseActions = onClose || onCloseOthers || onCloseAll;
  const hasFileActions = onRename || onDownload;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {onClose && (
          <ContextMenuItem
            onClick={() => onClose(path)}
            className="gap-2 text-xs"
          >
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Close
            <ContextMenuShortcut>Ctrl+W</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {onCloseOthers && (
          <ContextMenuItem
            onClick={() => onCloseOthers(path)}
            className="gap-2 text-xs"
          >
            <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Close Others
          </ContextMenuItem>
        )}
        {onCloseAll && (
          <ContextMenuItem
            onClick={onCloseAll}
            className="gap-2 text-xs"
          >
            <XSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Close All
          </ContextMenuItem>
        )}

        {hasCloseActions && hasFileActions && <ContextMenuSeparator />}

        {onRename && (
          <ContextMenuItem
            onClick={() => onRename(path)}
            className="gap-2 text-xs"
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Rename
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {onDownload && (
          <ContextMenuItem
            onClick={() => onDownload(path)}
            className="gap-2 text-xs"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Download
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
