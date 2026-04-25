import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { CreatorConfig } from "../src/lib/types";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/create-assistant.ts <creator-slug>");
    console.error("Example: npx tsx scripts/create-assistant.ts demo");
    process.exit(1);
  }

  const configPath = path.join(process.cwd(), "creators", `${slug}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const config: CreatorConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const openai = new OpenAI();

  const productList = config.products
    .map((p) => `- ${p.name} (ID: ${p.id}, ${p.category}): ${p.description} — ${p.price}`)
    .join("\n");

  const systemPrompt = `You are ${config.name}'s AI assistant. You speak in their voice and help fans with questions about health, wellness, fitness, and lifestyle.

PERSONALITY & TONE:
${config.bio}
- Be warm, knowledgeable, and direct
- Share personal experience and opinions naturally
- Keep responses concise (2-3 paragraphs max)
- Use casual, conversational language

PRODUCT KNOWLEDGE:
You have access to ${config.name}'s product catalog. When a fan's question naturally relates to a product, use the recommend_product function to show them the product card. Only recommend products when genuinely relevant to the conversation.

Available products:
${productList}

RULES:
- Never hallucinate products or recommendations not in the catalog
- If you don't know something specific about ${config.name}'s views, say "I'm not sure about that specific topic — you could DM ${config.name} directly for a personal answer"
- Never give medical advice. Say "I'm sharing what works for ${config.name}, but always check with your doctor"
- Be honest when a question is outside your knowledge`;

  console.log(`Creating OpenAI Assistant for "${config.name}" (${slug})...`);

  const assistant = await openai.beta.assistants.create({
    name: `${config.name} AI`,
    instructions: systemPrompt,
    model: "gpt-4o",
    tools: [
      {
        type: "function",
        function: {
          name: "recommend_product",
          description:
            "Recommend a product when the conversation naturally leads to it. Only call this when the user's question is genuinely related to a product in the catalog.",
          parameters: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description: "The ID of the product from the catalog",
              },
              reason: {
                type: "string",
                description: "Brief explanation of why this product is relevant",
              },
            },
            required: ["product_id", "reason"],
          },
        },
      },
    ],
  });

  console.log(`Assistant created: ${assistant.id}`);

  config.assistantId = assistant.id;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Updated ${configPath} with assistant ID`);

  console.log("\nTesting with a sample message...");
  const thread = await openai.beta.threads.create();
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: "What supplements do you take in the morning?",
  });

  const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  });

  if (run.status === "completed") {
    const messages = await openai.beta.threads.messages.list(thread.id);
    const reply = messages.data[0];
    if (reply.content[0].type === "text") {
      console.log(`\nSample response:\n${reply.content[0].text.value}`);
    }
  } else if (run.status === "requires_action") {
    console.log("\nAssistant wants to recommend a product (function call triggered). Working correctly.");
    const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls ?? [];
    for (const call of toolCalls) {
      console.log(`  Function: ${call.function.name}`);
      console.log(`  Args: ${call.function.arguments}`);
    }
  } else {
    console.log(`\nRun ended with status: ${run.status}`);
  }

  await openai.beta.threads.delete(thread.id);
  console.log("\nDone. Run `npm run dev` and visit http://localhost:3000/demo");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
