// src/commands/simulationCacheCommands.ts
import * as vscode from 'vscode';
import { SimulationCacheService } from '../services/simulationCacheService';

export function registerSimulationCacheCommands(context: vscode.ExtensionContext) {
  const clear = vscode.commands.registerCommand('stellarSuite.clearSimulationCache', () => {
    const cache = SimulationCacheService.getInstance(context);
    cache.clear();
    vscode.window.showInformationMessage('Simulation cache cleared.');
  });

  const stats = vscode.commands.registerCommand('stellarSuite.showSimulationCacheStats', () => {
    const cache = SimulationCacheService.getInstance(context);
    const s = cache.getStats();

    const ttlSec = Math.round((s.options.ttlMs ?? 0) / 1000);
    vscode.window.showInformationMessage(
      `Simulation cache: size=${s.size}, hits=${s.hits}, misses=${s.misses}, sets=${s.sets}, evictions=${s.evictions}, ttl=${ttlSec}s, max=${s.options.maxEntries}`
    );
  });

  context.subscriptions.push(clear, stats);
}