import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { CreatorConfig, Product } from "../src/lib/types";

interface ScrapedContent {
  source: string;
  items: { text: string; url?: string; date?: string }[];
}

async function scrapeYouTube(handle: string): Promise<ScrapedContent> {
  const cleanHandle = handle.replace(/^@/, "");
  const items: ScrapedContent["items"] = [];

  try {
    // YouTube RSS feed is publicly accessible without API key
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?user=${cleanHandle}`;
    const res = await fetch(feedUrl);
    if (!res.ok) {
      // Try channel handle format
      const altUrl = `https://www.youtube.com/@${cleanHandle}`;
      console.log(`  YouTube RSS not available, will use channel URL: ${altUrl}`);
      return { source: "youtube", items: [] };
    }
    const xml = await res.text();

    // Basic XML parsing for titles and descriptions
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    for (const entry of entries.slice(0, 20)) {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
      const description =
        entry.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] ?? "";
      const link = entry.match(/<link rel="alternate" href="(.*?)"/)?.[1] ?? "";
      const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? "";

      if (title || description) {
        items.push({
          text: `[VIDEO] ${title}\n${description}`.trim(),
          url: link,
          date: published,
        });
      }
    }
  } catch (err) {
    console.log(`  YouTube scrape failed: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return { source: "youtube", items };
}

async function scrapeTwitterBio(handle: string): Promise<ScrapedContent> {
  const cleanHandle = handle.replace(/^@/, "");
  const items: ScrapedContent["items"] = [];

  try {
    // Nitter instances provide public access to tweets
    const nitterInstances = [
      `https://nitter.net/${cleanHandle}`,
      `https://nitter.privacydev.net/${cleanHandle}`,
    ];

    for (const url of nitterInstances) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        // Extract tweet text from Nitter HTML
        const tweetMatches =
          html.match(/<div class="tweet-content media-body"[^>]*>([\s\S]*?)<\/div>/g) ?? [];

        for (const tweet of tweetMatches.slice(0, 30)) {
          const text = tweet
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;/g, "'")
            .trim();
          if (text.length > 20) {
            items.push({ text: `[TWEET] ${text}` });
          }
        }

        if (items.length > 0) break;
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.log(`  Twitter scrape failed: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return { source: "twitter", items };
}

async function scrapeInstagramBio(handle: string): Promise<ScrapedContent> {
  const cleanHandle = handle.replace(/^@/, "");
  const items: ScrapedContent["items"] = [];

  try {
    // Try public profile JSON endpoint
    const res = await fetch(`https://www.instagram.com/${cleanHandle}/?__a=1&__d=dis`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        const bio = data?.graphql?.user?.biography ?? "";
        if (bio) {
          items.push({ text: `[BIO] ${bio}` });
        }
      } catch {
        // Instagram blocks JSON access — expected
      }
    }
  } catch {
    // Expected to fail — Instagram blocks most scraping
  }

  if (items.length === 0) {
    console.log(
      `  Instagram scraping blocked (expected). Add content manually or provide the creator's bio.`
    );
  }

  return { source: "instagram", items };
}

async function generateCreatorConfig(
  slug: string,
  name: string,
  scrapedContent: ScrapedContent[]
): Promise<CreatorConfig> {
  const allContent = scrapedContent
    .flatMap((s) => s.items.map((i) => i.text))
    .join("\n\n");

  if (!allContent.trim()) {
    console.log("\nNo content scraped. Generating a minimal config template.");
    return {
      slug,
      name,
      assistantId: "PENDING",
      bio: `${name} — health & wellness creator`,
      products: [
        {
          id: "product-1",
          name: "Example Product",
          category: "supplements",
          description: "Replace with real product",
          price: "$0",
          imageUrl: "https://placehold.co/200x200/e2e8f0/64748b?text=Product",
          affiliateUrl: "https://example.com",
        },
      ],
      rateLimits: {
        messagesPerHourPerIp: 20,
        dailySpendCapUsd: 10,
      },
    };
  }

  const openai = new OpenAI();

  console.log("\nAnalyzing content with AI to generate creator config...");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You analyze a creator's public content and generate a structured profile for an AI chatbot.

Output valid JSON with this structure:
{
  "bio": "2-3 sentence bio capturing their expertise and voice",
  "faq_pairs": [
    {"question": "common fan question", "answer": "answer in the creator's voice"}
  ],
  "detected_products": [
    {"name": "product name", "category": "supplements|fitness|wellness|lifestyle", "description": "what it is"}
  ],
  "voice_notes": "3-5 bullet points describing how this creator writes/speaks"
}

Rules:
- Extract 10-20 FAQ pairs from the content (questions fans would ask based on what the creator posts about)
- Detect any products, brands, or services the creator mentions or promotes
- Capture their voice: casual vs formal, emoji usage, catchphrases, sentence length
- Be specific — use actual quotes and examples from their content`,
      },
      {
        role: "user",
        content: `Creator: ${name} (@${slug})\n\nPublic content:\n${allContent.slice(0, 15000)}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const analysis = JSON.parse(completion.choices[0].message.content ?? "{}");

  const products: Product[] = (analysis.detected_products ?? []).map(
    (p: { name: string; category: string; description: string }, i: number) => ({
      id: `product-${i + 1}`,
      name: p.name,
      category: p.category,
      description: p.description,
      price: "CHECK",
      imageUrl: `https://placehold.co/200x200/e2e8f0/64748b?text=${encodeURIComponent(p.name.slice(0, 10))}`,
      affiliateUrl: "https://example.com/REPLACE",
    })
  );

  if (products.length === 0) {
    products.push({
      id: "product-1",
      name: "Example Product",
      category: "supplements",
      description: "Replace with real product and affiliate URL",
      price: "CHECK",
      imageUrl: "https://placehold.co/200x200/e2e8f0/64748b?text=Product",
      affiliateUrl: "https://example.com/REPLACE",
    });
  }

  console.log(`\nExtracted:`);
  console.log(`  ${(analysis.faq_pairs ?? []).length} FAQ pairs`);
  console.log(`  ${products.length} products detected`);
  console.log(`  Voice notes: ${analysis.voice_notes ?? "none"}`);

  // Save FAQ pairs separately for the assistant system prompt
  const faqPath = path.join(process.cwd(), "creators", `${slug}-faq.json`);
  fs.writeFileSync(faqPath, JSON.stringify(analysis.faq_pairs ?? [], null, 2) + "\n");
  console.log(`  FAQ pairs saved to ${faqPath}`);

  // Save voice notes
  const voicePath = path.join(process.cwd(), "creators", `${slug}-voice.md`);
  fs.writeFileSync(voicePath, `# ${name} Voice Notes\n\n${analysis.voice_notes ?? ""}\n`);
  console.log(`  Voice notes saved to ${voicePath}`);

  return {
    slug,
    name,
    assistantId: "PENDING",
    bio: analysis.bio ?? `${name} — creator`,
    products,
    rateLimits: {
      messagesPerHourPerIp: 20,
      dailySpendCapUsd: 10,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(`Usage: npm run scrape-creator -- <slug> [options]

Options:
  --name "Creator Name"       Display name (required if no socials found)
  --youtube @handle           YouTube channel handle
  --twitter @handle           Twitter/X handle
  --instagram @handle         Instagram handle
  --file path/to/content.txt  Local file with creator content (FAQ docs, transcripts, etc.)

Examples:
  npm run scrape-creator -- bryanjohnson --youtube @bryanjohnson --twitter @bryan_johnson
  npm run scrape-creator -- demo --name "Demo Creator" --file creator-notes.txt`);
    process.exit(1);
  }

  const slug = args[0];
  let name = slug;
  let youtube: string | null = null;
  let twitter: string | null = null;
  let instagram: string | null = null;
  let localFile: string | null = null;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        name = args[++i];
        break;
      case "--youtube":
        youtube = args[++i];
        break;
      case "--twitter":
        twitter = args[++i];
        break;
      case "--instagram":
        instagram = args[++i];
        break;
      case "--file":
        localFile = args[++i];
        break;
    }
  }

  console.log(`\nScraping public content for: ${name} (@${slug})\n`);

  const scrapedContent: ScrapedContent[] = [];

  // Scrape each source in parallel
  const scrapers: Promise<ScrapedContent>[] = [];

  if (youtube) {
    console.log(`Scraping YouTube: ${youtube}`);
    scrapers.push(scrapeYouTube(youtube));
  }
  if (twitter) {
    console.log(`Scraping Twitter/X: ${twitter}`);
    scrapers.push(scrapeTwitterBio(twitter));
  }
  if (instagram) {
    console.log(`Scraping Instagram: ${instagram}`);
    scrapers.push(scrapeInstagramBio(instagram));
  }

  const results = await Promise.all(scrapers);
  scrapedContent.push(...results);

  // Add local file content
  if (localFile) {
    const filePath = path.resolve(localFile);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      console.log(`Reading local file: ${filePath} (${content.length} chars)`);
      scrapedContent.push({
        source: "local",
        items: [{ text: content }],
      });
    } else {
      console.error(`File not found: ${filePath}`);
    }
  }

  const totalItems = scrapedContent.reduce((sum, s) => sum + s.items.length, 0);
  console.log(`\nTotal content items scraped: ${totalItems}`);

  for (const source of scrapedContent) {
    console.log(`  ${source.source}: ${source.items.length} items`);
  }

  // Generate creator config
  const config = await generateCreatorConfig(slug, name, scrapedContent);

  // Save config
  const configPath = path.join(process.cwd(), "creators", `${slug}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`\nConfig saved to ${configPath}`);

  // Next steps
  console.log(`
Next steps:
  1. Review and edit ${configPath}
     - Update product prices and affiliate URLs
     - Adjust bio if needed
  2. Review FAQ pairs in creators/${slug}-faq.json
     - Remove any inaccurate pairs
     - Add missing common questions
  3. Create the OpenAI Assistant:
     npm run create-assistant -- ${slug}
  4. Start the dev server:
     npm run dev
  5. Visit http://localhost:3000/${slug}
`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
