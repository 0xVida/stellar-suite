import { NextRequest } from "next/server";

import {
  createAnthropicRequestBody,
  createOpenAIRequestBody,
  isChatMessageArray,
  resolveProviderConfig,
  type ChatRequestPayload,
} from "@/lib/ai-chat";

export const runtime = "nodejs";

const encoder = new TextEncoder();

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const formatSseEvent = (event: string, data: Record<string, unknown>) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const createSseErrorResponse = (message: string, status = 400) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(formatSseEvent("error", { message }));
        controller.close();
      },
    }),
    {
      status,
      headers: sseHeaders,
    },
  );

const parseOpenAIChunk = (json: string): string | null => {
  const parsed = JSON.parse(json) as {
    choices?: Array<{
      delta?: {
        content?: string;
      };
    }>;
  };

  return parsed.choices?.[0]?.delta?.content ?? null;
};

const parseAnthropicChunk = (json: string): string | null => {
  const parsed = JSON.parse(json) as {
    type?: string;
    delta?: {
      text?: string;
    };
  };

  if (parsed.type !== "content_block_delta") {
    return null;
  }

  return parsed.delta?.text ?? null;
};

const streamUpstreamSse = async (
  upstream: Response,
  provider: "openai" | "anthropic",
  controller: ReadableStreamDefaultController<Uint8Array>,
) => {
  if (!upstream.body) {
    throw new Error("Provider returned an empty stream.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleEventBlock = (block: string) => {
    const lines = block.split("\n");
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines.join("\n");
    if (!payload || payload === "[DONE]") {
      return;
    }

    const text =
      provider === "openai"
        ? parseOpenAIChunk(payload)
        : parseAnthropicChunk(payload);

    if (text) {
      controller.enqueue(formatSseEvent("token", { text }));
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const eventBlock of events) {
      handleEventBlock(eventBlock);
    }
  }

  if (buffer.trim()) {
    handleEventBlock(buffer);
  }
};

export async function POST(request: NextRequest) {
  let payload: ChatRequestPayload;

  try {
    payload = (await request.json()) as ChatRequestPayload;
  } catch {
    return createSseErrorResponse("Invalid JSON payload.");
  }

  if (!isChatMessageArray(payload.messages) || payload.messages.length === 0) {
    return createSseErrorResponse("At least one chat message is required.");
  }

  const lastMessage = payload.messages[payload.messages.length - 1];
  if (lastMessage.role !== "user" || !lastMessage.content.trim()) {
    return createSseErrorResponse("The latest message must be a non-empty user message.");
  }

  let providerConfig;
  try {
    providerConfig = resolveProviderConfig(payload.provider);
  } catch (error) {
    return createSseErrorResponse(
      error instanceof Error ? error.message : "AI provider configuration error.",
      500,
    );
  }

  const requestInit: {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  } =
    providerConfig.provider === "openai"
      ? {
          url: "https://api.openai.com/v1/chat/completions",
          headers: {
            Authorization: `Bearer ${providerConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          body: createOpenAIRequestBody(
            payload.messages,
            providerConfig.model,
            payload.activeFile,
          ),
        }
      : {
          url: "https://api.anthropic.com/v1/messages",
          headers: {
            "x-api-key": providerConfig.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: createAnthropicRequestBody(
            payload.messages,
            providerConfig.model,
            payload.activeFile,
          ),
        };

  let upstream: Response;
  try {
    upstream = await fetch(requestInit.url, {
      method: "POST",
      headers: requestInit.headers,
      body: JSON.stringify(requestInit.body),
    });
  } catch (error) {
    return createSseErrorResponse(
      error instanceof Error ? error.message : "Unable to reach AI provider.",
      502,
    );
  }

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return createSseErrorResponse(
      errorText || `AI provider request failed with status ${upstream.status}.`,
      upstream.status,
    );
  }

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            formatSseEvent("meta", {
              provider: providerConfig.provider,
              model: providerConfig.model,
            }),
          );
          await streamUpstreamSse(upstream, providerConfig.provider, controller);
          controller.enqueue(formatSseEvent("done", { ok: true }));
        } catch (error) {
          controller.enqueue(
            formatSseEvent("error", {
              message:
                error instanceof Error
                  ? error.message
                  : "Streaming failed unexpectedly.",
            }),
          );
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: sseHeaders,
    },
  );
}
