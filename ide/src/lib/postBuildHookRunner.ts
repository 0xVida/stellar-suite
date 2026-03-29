import { PostBuildHook } from "@/store/usePostBuildHooksStore";

export interface HookResult {
  hook: PostBuildHook;
  success: boolean;
  output: string;
}

async function runScriptHook(hook: PostBuildHook): Promise<HookResult> {
  try {
    const response = await fetch("/api/run-hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: hook.command }),
    });

    const data = (await response.json()) as {
      exitCode: number;
      stdout: string;
      stderr: string;
      error?: string;
    };

    const combinedOutput = [data.stdout, data.stderr].filter(Boolean).join("\n");

    return {
      hook,
      success: data.exitCode === 0,
      output: combinedOutput || (data.error ?? ""),
    };
  } catch (err) {
    return {
      hook,
      success: false,
      output: err instanceof Error ? err.message : "Failed to run hook",
    };
  }
}

async function runWebhookHook(hook: PostBuildHook): Promise<HookResult> {
  try {
    const response = await fetch(hook.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "build:success", timestamp: new Date().toISOString() }),
    });

    return {
      hook,
      success: response.ok,
      output: `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (err) {
    return {
      hook,
      success: false,
      output: err instanceof Error ? err.message : "Webhook request failed",
    };
  }
}

export async function runPostBuildHooks(
  hooks: PostBuildHook[],
  onOutput: (text: string) => void,
): Promise<void> {
  const enabled = hooks.filter((h) => h.enabled);
  if (enabled.length === 0) return;

  onOutput("\r\n> Running post-build hooks...\r\n");

  for (const hook of enabled) {
    const label = hook.label || (hook.type === "script" ? hook.command : hook.webhookUrl);
    onOutput(`  [hook] ${label}\r\n`);

    const result =
      hook.type === "script"
        ? await runScriptHook(hook)
        : await runWebhookHook(hook);

    if (result.output) {
      const lines = result.output.split("\n");
      for (const line of lines) {
        if (line.trim()) onOutput(`  ${line}\r\n`);
      }
    }

    if (result.success) {
      onOutput(`  ✓ Hook succeeded\r\n`);
    } else {
      onOutput(`  ✗ Hook failed\r\n`);
    }
  }

  onOutput("> Post-build hooks complete.\r\n");
}
