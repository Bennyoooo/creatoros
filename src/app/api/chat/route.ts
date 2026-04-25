import { NextRequest } from "next/server";
import OpenAI from "openai";
import { getCreatorConfig, getProductById } from "@/lib/creators";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getOrCreateSessionId, getThreadId, setThreadId } from "@/lib/session";

function getOpenAI() {
  return new OpenAI();
}

const RECOMMEND_PRODUCT_FUNCTION: OpenAI.FunctionDefinition = {
  name: "recommend_product",
  description:
    "Recommend a product to the user when the conversation context suggests they would benefit from it. Only call this when the user's question naturally leads to a product recommendation.",
  parameters: {
    type: "object" as const,
    properties: {
      product_id: {
        type: "string",
        description: "The ID of the product to recommend from the creator's catalog",
      },
      reason: {
        type: "string",
        description: "Brief explanation of why this product is relevant to the conversation",
      },
    },
    required: ["product_id", "reason"],
  },
};

export async function POST(request: NextRequest) {
  try {
    const { message, creatorSlug } = await request.json();

    if (!message || !creatorSlug) {
      return Response.json({ error: "Missing message or creatorSlug" }, { status: 400 });
    }

    const config = getCreatorConfig(creatorSlug);
    if (!config) {
      return Response.json({ error: "Creator not found" }, { status: 404 });
    }

    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rateLimitResult = checkRateLimit(ip, creatorSlug, config.rateLimits);
    if (!rateLimitResult.allowed) {
      return Response.json(
        {
          error: rateLimitResult.reason,
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const sessionId = await getOrCreateSessionId();
    let threadId = getThreadId(sessionId, creatorSlug);

    const openai = getOpenAI();

    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      setThreadId(sessionId, creatorSlug, threadId);
    }

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });

    const productCatalogDescription = config.products
      .map((p) => `- ${p.id}: ${p.name} (${p.category}) - ${p.description}`)
      .join("\n");

    const stream = openai.beta.threads.runs.stream(threadId, {
      assistant_id: config.assistantId,
      tools: [
        {
          type: "function",
          function: RECOMMEND_PRODUCT_FUNCTION,
        },
      ],
      additional_instructions: `Available products in the creator's catalog:\n${productCatalogDescription}\n\nWhen the user's question naturally leads to a product recommendation, call the recommend_product function with the appropriate product_id.`,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.event === "thread.message.delta") {
              const delta = event.data.delta;
              if (delta.content) {
                for (const block of delta.content) {
                  if (block.type === "text" && block.text?.value) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "text", content: block.text.value })}\n\n`)
                    );
                  }
                }
              }
            }

            if (event.event === "thread.run.requires_action") {
              const run = event.data;
              const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls ?? [];

              const toolOutputs: OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[] = [];

              for (const toolCall of toolCalls) {
                if (toolCall.function.name === "recommend_product") {
                  const args = JSON.parse(toolCall.function.arguments);
                  const product = getProductById(config, args.product_id);

                  if (product) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "product_card", product })}\n\n`
                      )
                    );
                    toolOutputs.push({
                      tool_call_id: toolCall.id,
                      output: JSON.stringify({
                        success: true,
                        product_name: product.name,
                        message: `Product card for "${product.name}" has been shown to the user.`,
                      }),
                    });
                  } else {
                    toolOutputs.push({
                      tool_call_id: toolCall.id,
                      output: JSON.stringify({
                        success: false,
                        message: "Product not found in catalog",
                      }),
                    });
                  }
                }
              }

              if (toolOutputs.length > 0) {
                const continuedStream = openai.beta.threads.runs.submitToolOutputsStream(
                  run.id,
                  { thread_id: threadId!, tool_outputs: toolOutputs }
                );

                for await (const contEvent of continuedStream) {
                  if (contEvent.event === "thread.message.delta") {
                    const delta = contEvent.data.delta;
                    if (delta.content) {
                      for (const block of delta.content) {
                        if (block.type === "text" && block.text?.value) {
                          controller.enqueue(
                            encoder.encode(
                              `data: ${JSON.stringify({ type: "text", content: block.text.value })}\n\n`
                            )
                          );
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[CHAT API ERROR]", err);
    return Response.json({ error: "api_error" }, { status: 500 });
  }
}
