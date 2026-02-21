// ============================================================
// src/services/toastNotificationVscode.ts
// VS Code-specific toast notification service factory
// ============================================================

import * as vscode from "vscode";
import { ToastNotificationService } from "./toastNotificationService";
import { ToastQueueConfig, ToastPosition } from "../types/toastNotification";
import { NotificationPreferencesService } from "./notificationPreferencesService";

/**
 * Build queue config from VS Code workspace settings and user preferences.
 * User preferences (from preferences service) override workspace settings.
 */
function buildQueueConfig(
  workspaceConfig: vscode.WorkspaceConfiguration,
  preferencesService: NotificationPreferencesService,
): ToastQueueConfig {
  const prefs = preferencesService.getPreferences();
  const fromSettings: Partial<ToastQueueConfig> = {
    maxVisible: workspaceConfig.get<number>("maxVisible", 3),
    maxQueued: workspaceConfig.get<number>("maxQueued", 10),
    defaultDuration: workspaceConfig.get<number>("defaultDuration", 5000),
    position: workspaceConfig.get<ToastPosition>(
      "position",
      ToastPosition.BottomRight,
    ),
    enableAnimations: workspaceConfig.get<boolean>("enableAnimations", true),
    enabled: workspaceConfig.get<boolean>("enabled", true),
    actionsEnabled: workspaceConfig.get<boolean>("actionsEnabled", true),
  };
  const fromPrefs = preferencesService.preferencesToQueueConfig(prefs);
  return { ...fromSettings, ...fromPrefs };
}

/**
 * Create a toast notification service configured for VS Code.
 * Uses workspace settings and notification preferences (stored in workspace state).
 * When preferences change, the toast service config is updated live.
 */
export function createToastNotificationService(
  context: vscode.ExtensionContext,
  preferencesService: NotificationPreferencesService,
): ToastNotificationService {
  const workspaceConfig = vscode.workspace.getConfiguration(
    "stellarSuite.notifications",
  );
  const queueConfig = buildQueueConfig(workspaceConfig, preferencesService);
  const service = new ToastNotificationService(queueConfig);

  context.subscriptions.push(service);

  const sub = preferencesService.onDidChangePreferences(() => {
    const prefs = preferencesService.getPreferences();
    service.updateConfig(preferencesService.preferencesToQueueConfig(prefs));
  });
  context.subscriptions.push(sub);

  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("stellarSuite.notifications")) {
      const config = vscode.workspace.getConfiguration(
        "stellarSuite.notifications",
      );
      const prefs = preferencesService.getPreferences();
      const fromSettings: Partial<ToastQueueConfig> = {
        maxVisible: config.get<number>("maxVisible", 3),
        maxQueued: config.get<number>("maxQueued", 10),
        defaultDuration: config.get<number>("defaultDuration", 5000),
        position: config.get<ToastPosition>(
          "position",
          ToastPosition.BottomRight,
        ),
        enableAnimations: config.get<boolean>("enableAnimations", true),
        enabled: config.get<boolean>("enabled", true),
        actionsEnabled: config.get<boolean>("actionsEnabled", true),
      };
      const fromPrefs = preferencesService.preferencesToQueueConfig(prefs);
      service.updateConfig({ ...fromSettings, ...fromPrefs });
    }
  });
  context.subscriptions.push(configListener);

  return service;
}
