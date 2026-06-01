import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard, AlertCircle, Edit2, Check, X, RotateCcw } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { CommandRegistry, Command, ShortcutCategory } from "@/lib/commands/CommandRegistry";
import { useKeybindingsStore, Keybinding } from "@/store/useKeybindingsStore";
import { toast } from "sonner";

interface HotkeysModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KeyCombo = ({ binding }: { binding: Keybinding | null }) => {
  if (!binding) return <span className="text-xs text-muted-foreground italic">Unbound</span>;
  
  const keys: string[] = [];
  if (binding.ctrlKey) keys.push("Ctrl");
  if (binding.metaKey) keys.push("Cmd");
  if (binding.altKey) keys.push("Alt");
  if (binding.shiftKey) keys.push("Shift");
  
  // Format key display
  let displayKey = binding.key;
  if (displayKey === " ") displayKey = "Space";
  else if (displayKey.length === 1) displayKey = displayKey.toUpperCase();
  keys.push(displayKey);

  return (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <div key={index} className="flex items-center">
          <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">
            {key}
          </span>
          {index < keys.length - 1 && (
            <span className="mx-1 text-gray-500">+</span>
          )}
        </div>
      ))}
    </div>
  );
};

export const HotkeysModal = ({ open, onOpenChange }: HotkeysModalProps) => {
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [recordedBinding, setRecordedBinding] = useState<Keybinding | null>(null);
  const [conflict, setConflict] = useState<Command[]>([]);
  
  const customBindings = useKeybindingsStore((state) => state.customBindings);
  const setBinding = useKeybindingsStore((state) => state.setBinding);
  const resetBinding = useKeybindingsStore((state) => state.resetBinding);

  useEffect(() => {
    const handleOpenHotkeys = () => onOpenChange(true);
    window.addEventListener('ide:open-hotkeys', handleOpenHotkeys);
    return () => window.removeEventListener('ide:open-hotkeys', handleOpenHotkeys);
  }, [onOpenChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!editingCommandId) return;
    
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setEditingCommandId(null);
      setRecordedBinding(null);
      setConflict([]);
      return;
    }

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; // Wait for a non-modifier key

    const newBinding: Keybinding = {
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    };

    setRecordedBinding(newBinding);
    const conflicts = CommandRegistry.checkConflicts(newBinding, editingCommandId);
    setConflict(conflicts);
  }, [editingCommandId]);

  useEffect(() => {
    if (editingCommandId) {
      window.addEventListener('keydown', handleKeyDown, true);
    } else {
      window.removeEventListener('keydown', handleKeyDown, true);
    }
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [editingCommandId, handleKeyDown]);

  const saveBinding = () => {
    if (editingCommandId && recordedBinding) {
      if (conflict.length > 0) {
        toast.error(`Keybinding conflict! Already used by: ${conflict.map(c => c.title).join(', ')}`);
        return;
      }
      setBinding(editingCommandId, recordedBinding);
      setEditingCommandId(null);
      setRecordedBinding(null);
      setConflict([]);
      toast.success("Shortcut updated!");
    }
  };

  const cancelEditing = () => {
    setEditingCommandId(null);
    setRecordedBinding(null);
    setConflict([]);
  };

  // Close editing state if modal closes
  useEffect(() => {
    if (!open) cancelEditing();
  }, [open]);

  const categories: ShortcutCategory[] = ["Navigation", "Editor", "Git", "Build", "System"];
  const allCommands = CommandRegistry.getAllCommands();

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val && editingCommandId) return; // Prevent close while editing
      onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Customize your IDE experience by remapping keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-2 pb-4">
          {categories.map(category => {
            const categoryCommands = allCommands.filter(c => c.category === category);
            if (categoryCommands.length === 0) return null;
            
            return (
              <div key={category} className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1">
                  {category}
                </h4>
                <div className="space-y-1">
                  {categoryCommands.map((command) => {
                    const isEditing = editingCommandId === command.id;
                    const activeBinding = isEditing && recordedBinding 
                      ? recordedBinding 
                      : CommandRegistry.getActiveKeybinding(command.id);

                    return (
                      <div key={command.id} className="group flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20 px-3 rounded -mx-3 transition-colors">
                        <div className="flex flex-col pr-4">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {command.title}
                          </span>
                          <span className="text-xs text-gray-500 line-clamp-1">
                            {command.description}
                          </span>
                          {isEditing && conflict.length > 0 && (
                            <span className="text-xs text-red-500 flex items-center gap-1 mt-1">
                              <AlertCircle className="h-3 w-3" />
                              Conflict with: {conflict[0].title}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 shrink-0">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 border rounded ${conflict.length > 0 ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-primary bg-primary/5'}`}>
                                {recordedBinding ? (
                                  <KeyCombo binding={recordedBinding} />
                                ) : (
                                  <span className="text-xs text-muted-foreground animate-pulse px-2">Press keys...</span>
                                )}
                              </div>
                              <button onClick={saveBinding} disabled={conflict.length > 0 || !recordedBinding} className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded disabled:opacity-50 transition-colors">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={cancelEditing} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <KeyCombo binding={activeBinding} />
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingCommandId(command.id)} className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title="Edit Shortcut">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                {customBindings[command.id] ? (
                                  <button onClick={() => resetBinding(command.id)} className="p-1.5 text-gray-500 hover:text-orange-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title="Reset to Default">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <div className="w-6" /> // Placeholder to prevent jump
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
