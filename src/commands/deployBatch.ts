import * as vscode from 'vscode';
import * as path from 'path';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';
import { WasmDetector } from '../utils/wasmDetector';
import { BatchDeploymentService } from '../services/batchDeploymentService';
import { BatchDeploymentItem, BatchMode } from '../types/batchDeployment';
import { formatError } from '../utils/errorFormatter';
import { ContractMetadataService } from '../services/contractMetadataService';
import { resolveDeploymentDependencies } from '../services/deploymentDependencyResolver';
import { ProgressIndicatorService } from '../services/progressIndicatorService';
import { formatProgressMessage, OperationProgressStatusBar } from '../ui/progressComponents';

function mkId(i: number, base: string): string {
  return `${i + 1}-${base.replace(/[^a-z0-9_-]/gi, '').slice(0, 24)}`;
}

export async function deployBatch(context: vscode.ExtensionContext) {
  const progressService = new ProgressIndicatorService();
  const operation = progressService.createOperation({
    id: `batch-${Date.now()}`,
    title: 'Batch Deployment',
    cancellable: true,
  });
  const statusBar = new OperationProgressStatusBar();
  statusBar.bind(operation);

  const output = vscode.window.createOutputChannel('Stellar Suite - Batch Deployment');
  output.show(true);
  output.appendLine('=== Stellar Batch Deployment ===\n');

  try {
    const resolvedCliConfig = await resolveCliConfigurationForCommand(context);
    if (!resolvedCliConfig.validation.valid) {
      vscode.window.showErrorMessage(
        `CLI configuration is invalid: ${resolvedCliConfig.validation.errors.join(' ')}`
      );
      return;
    }

    const cliPath = resolvedCliConfig.configuration.cliPath;
    const source = resolvedCliConfig.configuration.source;
    const network = resolvedCliConfig.configuration.network;

    // Pick mode
    const modePick = await vscode.window.showQuickPick(
      [
        { label: 'Sequential', value: 'sequential' as BatchMode, detail: 'Deploy one-by-one in order' },
        { label: 'Parallel', value: 'parallel' as BatchMode, detail: 'Deploy in parallel (dependency-safe waves)' },
      ],
      { placeHolder: 'Choose batch deployment mode' }
    );
    if (!modePick) return;

    // Choose inputs: contract directories or wasm files
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'Deploy all detected contracts in workspace', value: 'contracts' as const },
        { label: 'Deploy all detected WASM files in workspace', value: 'wasms' as const },
        { label: 'Select contract directories…', value: 'pick_contracts' as const },
        { label: 'Select WASM files…', value: 'pick_wasms' as const },
      ],
      { placeHolder: 'What do you want to batch deploy?' }
    );
    if (!choice) return;

    let items: BatchDeploymentItem[] = [];

    if (choice.value === 'contracts') {
  // Use metadata service to get contract names + Cargo.toml paths, then compute dependency order.
  const outputChannel = output; // just alias for clarity

  const metaSvc = new ContractMetadataService(vscode.workspace as any, outputChannel);
  const scan = await metaSvc.scanWorkspace();

  if (!scan.contracts.length) {
    vscode.window.showErrorMessage('No Cargo.toml contracts found in workspace.');
    return;
  }

  // Compute graph + topo levels
  const depRes = resolveDeploymentDependencies(scan.contracts, { includeDevDependencies: false });

  if (depRes.cycles.length) {
    output.appendLine('\n❌ Dependency cycles detected. Cannot auto-order deployment.');
    for (const cyc of depRes.cycles) {
      output.appendLine(`  cycle: ${cyc.join(' -> ')}`);
    }
    vscode.window.showErrorMessage('Batch deploy blocked: dependency cycle detected (see output).');
    return;
  }

  // Map Cargo.toml path -> batch item
  const itemByCargo = new Map<string, BatchDeploymentItem>();
  const orderedContracts = depRes.order.length ? depRes.order : depRes.nodes;

  items = orderedContracts.map((cargoPath, i) => {
    const meta = scan.contracts.find(c => c.cargoTomlPath.replace(/\\/g, '/') === cargoPath) 
      ?? scan.contracts.find(c => c.cargoTomlPath === cargoPath);

    const dir = meta?.contractDir ?? path.dirname(cargoPath);

    const it: BatchDeploymentItem = {
      id: mkId(i, meta?.contractName ?? path.basename(dir)),
      name: meta?.contractName ?? path.basename(dir),
      contractDir: dir,
      dependsOn: [],
    };
    itemByCargo.set(cargoPath, it);
    return it;
  });

  // Fill dependsOn using edges (from depends on to)
  for (const e of depRes.edges) {
    const fromItem = itemByCargo.get(e.from);
    const toItem = itemByCargo.get(e.to);
    if (!fromItem || !toItem) continue;
    fromItem.dependsOn = Array.from(new Set([...(fromItem.dependsOn ?? []), toItem.id]));
  }

  output.appendLine(`[Batch] Dependency graph: ${depRes.nodes.length} nodes, ${depRes.edges.length} edges`);
  output.appendLine(`[Batch] Deployment order: ${items.map(i => i.name).join(', ')}`);
}

    if (choice.value === 'wasms') {
      const wasmFiles = await WasmDetector.findWasmFiles();
      if (!wasmFiles.length) {
        vscode.window.showErrorMessage('No WASM files found in workspace.');
        return;
      }
      items = wasmFiles.map((file, i) => ({
        id: mkId(i, path.basename(file)),
        name: path.basename(file),
        wasmPath: file,
      }));
    }

    if (choice.value === 'pick_contracts') {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        title: 'Select contract directories to deploy',
      });
      if (!picked || !picked.length) return;

      items = picked.map((u, i) => ({
        id: mkId(i, path.basename(u.fsPath)),
        name: path.basename(u.fsPath),
        contractDir: u.fsPath,
      }));
    }

    if (choice.value === 'pick_wasms') {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: { 'WASM files': ['wasm'] },
        title: 'Select WASM files to deploy',
      });
      if (!picked || !picked.length) return;

      items = picked.map((u, i) => ({
        id: mkId(i, path.basename(u.fsPath)),
        name: path.basename(u.fsPath),
        wasmPath: u.fsPath,
      }));
    }

    // Parallel concurrency prompt (only if parallel)
    let concurrency = 3;
    if (modePick.value === 'parallel') {
      const c = await vscode.window.showInputBox({
        title: 'Parallel concurrency',
        prompt: 'How many deployments should run at once?',
        value: '3',
        validateInput: (v) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > 10) return 'Enter an integer between 1 and 10';
          return null;
        },
      });
      if (!c) return;
      concurrency = Number(c);
    }

    const batchId = `batch-${Date.now()}`;
    const svc = new BatchDeploymentService();

    output.appendLine(`[Batch] Mode: ${modePick.value}`);
    output.appendLine(`[Batch] Network: ${network} · Source: ${source}`);
    output.appendLine(`[Batch] Items: ${items.length}`);
    output.appendLine('');

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Batch deploying contracts', cancellable: true },
      async (progress, token) => {
        operation.start('Starting batch deployment...');
        operation.bindCancellationToken(token);
        const lastPercentage = { value: 0 };
        const progressSubscription = operation.onUpdate((snapshot) => {
          const message = formatProgressMessage(snapshot);
          if (typeof snapshot.percentage === 'number') {
            const next = Math.max(lastPercentage.value, Math.round(snapshot.percentage));
            const increment = next - lastPercentage.value;
            if (increment > 0) {
              progress.report({ message, increment });
              lastPercentage.value = next;
              return;
            }
          }
          progress.report({ message });
        });

        try {
        const res = await svc.runBatch({
          batchId,
          mode: modePick.value,
          items,
          cliPath,
          source,
          network,
          concurrency,
          cancellationToken: token,
          onProgress: (ev) => {
            if (ev.message) output.appendLine(`[Batch] ${ev.message}`);
            if (ev.itemId && ev.itemStatus) {
              output.appendLine(`  • ${ev.itemId}: ${ev.itemStatus.status}`);
            }
            if (ev.overall) {
              const pct = Math.floor((ev.overall.done / Math.max(1, ev.overall.total)) * 100);
              operation.report({
                percentage: pct,
                message: `${ev.overall.done}/${ev.overall.total} completed`,
                details: ev.message ?? ev.itemId,
              });
            }
          },
        });

        // Summary
        const counts = res.results.reduce(
          (acc, r) => {
            acc[r.status] = (acc[r.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        output.appendLine('\n=== Batch Result Summary ===');
        output.appendLine(`Cancelled: ${res.cancelled ? 'yes' : 'no'}`);
        for (const k of ['succeeded', 'failed', 'skipped', 'cancelled']) {
          output.appendLine(`${k}: ${counts[k] ?? 0}`);
        }

        // Show a concise notification
        const failed = counts['failed'] ?? 0;
        const succeeded = counts['succeeded'] ?? 0;
        const skipped = counts['skipped'] ?? 0;

        if (res.cancelled) {
          operation.cancel('Batch deployment cancelled');
          vscode.window.showWarningMessage(
            `Batch cancelled. Succeeded: ${succeeded}, Failed: ${failed}, Skipped: ${skipped}`
          );
        } else if (failed > 0) {
          operation.fail('Batch deployment finished with failures');
          vscode.window.showErrorMessage(
            `Batch finished with failures. Succeeded: ${succeeded}, Failed: ${failed}, Skipped: ${skipped}`
          );
        } else {
          operation.succeed('Batch deployment completed successfully');
          vscode.window.showInformationMessage(
            `Batch finished successfully. Succeeded: ${succeeded}, Skipped: ${skipped}`
          );
        }
        } finally {
          progressSubscription.dispose();
        }
      }
    );
  } catch (error) {
    const formatted = formatError(error, 'Batch Deployment');
    operation.fail(formatted.message, formatted.title);
    vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
    output.appendLine(`\n[Error] ${formatted.title}: ${formatted.message}`);
  } finally {
    operation.dispose();
    statusBar.dispose();
  }
}
