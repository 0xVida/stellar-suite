/**
 * PluginManager — core plugin architecture for Stellar Suite IDE.
 *
 * Allows external tools to register:
 *   - Sidebar panel items (dynamic UI injection)
 *   - Command palette entries (command registry hooks)
 *
 * Usage:
 * ```ts
 * import { pluginManager } from "@/lib/plugins/PluginManager";
 *
 * pluginManager.registerPlugin({
 *   id: "my-tool",
 *   name: "My Tool",
 *   version: "1.0.0",
 *   activate({ registerSidebarPanel, registerCommand }) {
 *     registerSidebarPanel({
 *       id: "my-tool-panel",
 *       label: "My Tool",
 *       icon: "tool",
 *       order: 100,
 *       component: MyToolPanel,
 *     });
 *     registerCommand({
 *       id: "my-tool.run",
 *       label: "Run My Tool",
 *       keybinding: "Ctrl+Shift+M",
 *       handler: () => console.log("running"),
 *     });
 *   },
 * });
 * ```
 *
 * feat: core-plugin-architecture  (#820)
 */

import type { ComponentType } from "react";

// ── Sidebar Panel ──────────────────────────────────────────────────────────

export interface SidebarPanelDefinition {
  /** Unique identifier — must be stable across reloads. */
  id: string;
  /** Display label shown in the sidebar tab / tooltip. */
  label: string;
  /**
   * Icon name (any lucide-react icon name, e.g. "terminal", "box") or a
   * fully custom React component. Defaults to "plug" when omitted.
   */
  icon?: string | ComponentType<{ className?: string }>;
  /**
   * Render order — lower numbers appear first. Built-in panels use 0–50;
   * plugins should use values >= 100 to avoid collisions.
   */
  order?: number;
  /** The React component to render inside the panel body. */
  component: ComponentType;
}

// ── Command ────────────────────────────────────────────────────────────────

export interface CommandDefinition {
  /** Unique command identifier, e.g. "my-plugin.run". */
  id: string;
  /** Human-readable label for the command palette. */
  label: string;
  /** Optional keyboard shortcut hint (display only — not auto-bound). */
  keybinding?: string;
  /** Callback invoked when the command is executed. */
  handler: () => void | Promise<void>;
}

// ── Plugin Definition ──────────────────────────────────────────────────────

export interface PluginActivationContext {
  registerSidebarPanel: (panel: SidebarPanelDefinition) => void;
  registerCommand: (command: CommandDefinition) => void;
}

export interface PluginDefinition {
  /** Stable unique identifier for the plugin, e.g. "stellar-traces". */
  id: string;
  /** Display name. */
  name: string;
  /** Semver string. */
  version: string;
  /** Called once when the plugin is registered. */
  activate: (ctx: PluginActivationContext) => void;
  /** Optional teardown hook called when the plugin is unregistered. */
  deactivate?: () => void;
}

// ── Plugin Registry ────────────────────────────────────────────────────────

export interface PluginRegistry {
  /** All registered sidebar panels, sorted by `order`. */
  sidebarPanels: SidebarPanelDefinition[];
  /** All registered commands, keyed by id. */
  commands: Map<string, CommandDefinition>;
}

type ChangeListener = (registry: PluginRegistry) => void;

class PluginManagerImpl {
  private readonly _plugins = new Map<string, PluginDefinition>();
  private readonly _panels: SidebarPanelDefinition[] = [];
  private readonly _commands = new Map<string, CommandDefinition>();
  private readonly _listeners = new Set<ChangeListener>();

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Register and immediately activate a plugin.
   * Warns and no-ops if a plugin with the same `id` is already registered.
   */
  registerPlugin(plugin: PluginDefinition): void {
    if (this._plugins.has(plugin.id)) {
      console.warn(
        `[PluginManager] Plugin "${plugin.id}" is already registered — skipping.`,
      );
      return;
    }

    this._plugins.set(plugin.id, plugin);

    const ctx: PluginActivationContext = {
      registerSidebarPanel: (panel) => this._addPanel(plugin.id, panel),
      registerCommand: (command) => this._addCommand(plugin.id, command),
    };

    try {
      plugin.activate(ctx);
    } catch (err) {
      console.error(
        `[PluginManager] Plugin "${plugin.id}" threw during activation:`,
        err,
      );
      // Roll back any partial registrations from this plugin
      this._removePluginContributions(plugin.id);
      this._plugins.delete(plugin.id);
      return;
    }

    this._notify();
  }

  /**
   * Unregister a plugin by id — calls its `deactivate` hook and removes all
   * sidebar panels and commands it contributed.
   */
  unregisterPlugin(pluginId: string): void {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) return;

    try {
      plugin.deactivate?.();
    } catch (err) {
      console.warn(
        `[PluginManager] Plugin "${pluginId}" threw during deactivation:`,
        err,
      );
    }

    this._removePluginContributions(pluginId);
    this._plugins.delete(pluginId);
    this._notify();
  }

  /** Execute a registered command by id. */
  async executeCommand(commandId: string): Promise<void> {
    const cmd = this._commands.get(commandId);
    if (!cmd) {
      console.warn(`[PluginManager] Unknown command: "${commandId}"`);
      return;
    }
    await cmd.handler();
  }

  /** Snapshot of the current registry state. */
  getRegistry(): PluginRegistry {
    return {
      sidebarPanels: [...this._panels].sort(
        (a, b) => (a.order ?? 100) - (b.order ?? 100),
      ),
      commands: new Map(this._commands),
    };
  }

  /** List of all registered plugin ids. */
  getRegisteredPluginIds(): string[] {
    return [...this._plugins.keys()];
  }

  /**
   * Subscribe to registry changes. Returns an unsubscribe function.
   * The listener is called immediately with the current registry.
   *
   * @example
   * ```ts
   * const off = pluginManager.subscribe((registry) => {
   *   setSidebarItems(registry.sidebarPanels);
   * });
   * // later…
   * off();
   * ```
   */
  subscribe(listener: ChangeListener): () => void {
    this._listeners.add(listener);
    // Emit current state immediately so subscribers stay in sync
    listener(this.getRegistry());
    return () => this._listeners.delete(listener);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private _addPanel(pluginId: string, panel: SidebarPanelDefinition): void {
    const conflict = this._panels.find((p) => p.id === panel.id);
    if (conflict) {
      console.warn(
        `[PluginManager] Sidebar panel id "${panel.id}" from plugin "${pluginId}" conflicts with an existing panel — skipping.`,
      );
      return;
    }
    // Tag the panel so we can roll it back on error / unregister
    (panel as SidebarPanelDefinition & { _pluginId?: string })._pluginId =
      pluginId;
    this._panels.push(panel);
  }

  private _addCommand(pluginId: string, command: CommandDefinition): void {
    if (this._commands.has(command.id)) {
      console.warn(
        `[PluginManager] Command id "${command.id}" from plugin "${pluginId}" conflicts — skipping.`,
      );
      return;
    }
    // Tag for rollback
    (command as CommandDefinition & { _pluginId?: string })._pluginId =
      pluginId;
    this._commands.set(command.id, command);
  }

  private _removePluginContributions(pluginId: string): void {
    // Remove panels contributed by this plugin
    const indicesToRemove: number[] = [];
    this._panels.forEach((p, i) => {
      if (
        (p as SidebarPanelDefinition & { _pluginId?: string })._pluginId ===
        pluginId
      ) {
        indicesToRemove.push(i);
      }
    });
    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
      this._panels.splice(indicesToRemove[i]!, 1);
    }

    // Remove commands contributed by this plugin
    for (const [id, cmd] of this._commands) {
      if (
        (cmd as CommandDefinition & { _pluginId?: string })._pluginId ===
        pluginId
      ) {
        this._commands.delete(id);
      }
    }
  }

  private _notify(): void {
    const registry = this.getRegistry();
    for (const listener of this._listeners) {
      try {
        listener(registry);
      } catch (err) {
        console.error("[PluginManager] Listener threw:", err);
      }
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

/** Global plugin manager singleton — import and use anywhere in the IDE. */
export const pluginManager = new PluginManagerImpl();
