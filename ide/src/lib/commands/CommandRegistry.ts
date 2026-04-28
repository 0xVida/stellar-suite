import { Keybinding, useKeybindingsStore } from '@/store/useKeybindingsStore';

export type ShortcutCategory = "Navigation" | "Editor" | "Git" | "Build" | "System";

export interface Command {
  id: string;
  title: string;
  description: string;
  category: ShortcutCategory;
  defaultKeys: Keybinding | null;
  action: () => void;
}

class CommandRegistryImpl {
  private commands: Map<string, Command> = new Map();

  public register(command: Command) {
    this.commands.set(command.id, command);
  }

  public unregister(id: string) {
    this.commands.delete(id);
  }

  public execute(id: string) {
    const cmd = this.commands.get(id);
    if (cmd) {
      cmd.action();
    }
  }

  public getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  public getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }

  public getActiveKeybinding(commandId: string): Keybinding | null {
    const customBindings = useKeybindingsStore.getState().customBindings;
    if (customBindings[commandId]) {
      return customBindings[commandId];
    }
    const cmd = this.commands.get(commandId);
    return cmd?.defaultKeys ?? null;
  }

  public checkConflicts(binding: Keybinding, ignoreCommandId?: string): Command[] {
    const commands = this.getAllCommands();
    return commands.filter((cmd) => {
      if (cmd.id === ignoreCommandId) return false;
      const activeKeys = this.getActiveKeybinding(cmd.id);
      if (!activeKeys) return false;
      
      return (
        activeKeys.key.toLowerCase() === binding.key.toLowerCase() &&
        !!activeKeys.ctrlKey === !!binding.ctrlKey &&
        !!activeKeys.metaKey === !!binding.metaKey &&
        !!activeKeys.shiftKey === !!binding.shiftKey &&
        !!activeKeys.altKey === !!binding.altKey
      );
    });
  }

  public handleKeyboardEvent(event: KeyboardEvent): boolean {
    const commands = this.getAllCommands();
    for (const cmd of commands) {
      const activeKeys = this.getActiveKeybinding(cmd.id);
      if (!activeKeys) continue;

      const matchesKey = event.key.toLowerCase() === activeKeys.key.toLowerCase();
      const matchesCtrl = !!activeKeys.ctrlKey === event.ctrlKey;
      const matchesMeta = !!activeKeys.metaKey === event.metaKey;
      const matchesShift = !!activeKeys.shiftKey === event.shiftKey;
      const matchesAlt = !!activeKeys.altKey === event.altKey;

      if (matchesKey && matchesCtrl && matchesMeta && matchesShift && matchesAlt) {
        event.preventDefault();
        event.stopPropagation();
        cmd.action();
        return true; // Handled
      }
    }
    return false;
  }
}

export const CommandRegistry = new CommandRegistryImpl();
