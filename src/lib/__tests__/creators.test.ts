import { describe, it, expect, beforeAll } from "vitest";
import { getCreatorConfig, getProductById } from "../creators";
import { CreatorConfig } from "../types";
import fs from "fs";
import path from "path";

const TEST_CONFIG: CreatorConfig = {
  slug: "test-creator",
  name: "Test Creator",
  assistantId: "asst_test123",
  bio: "Test bio",
  products: [
    {
      id: "prod-1",
      name: "Test Product",
      category: "supplements",
      description: "A test product",
      price: "$10",
      imageUrl: "https://example.com/img.jpg",
      affiliateUrl: "https://example.com/buy",
    },
    {
      id: "prod-2",
      name: "Another Product",
      category: "fitness",
      description: "Another test",
      price: "$20",
      imageUrl: "https://example.com/img2.jpg",
      affiliateUrl: "https://example.com/buy2",
    },
  ],
  rateLimits: { messagesPerHourPerIp: 20, dailySpendCapUsd: 10 },
};

const creatorsDir = path.join(process.cwd(), "creators");

beforeAll(() => {
  fs.mkdirSync(creatorsDir, { recursive: true });
  fs.writeFileSync(
    path.join(creatorsDir, "test-creator.json"),
    JSON.stringify(TEST_CONFIG)
  );
});

describe("creators", () => {
  it("loads a valid creator config by slug", () => {
    const config = getCreatorConfig("test-creator");
    expect(config).not.toBeNull();
    expect(config!.name).toBe("Test Creator");
    expect(config!.products).toHaveLength(2);
  });

  it("returns null for nonexistent creator", () => {
    const config = getCreatorConfig("nonexistent-creator");
    expect(config).toBeNull();
  });

  it("finds a product by ID", () => {
    const product = getProductById(TEST_CONFIG, "prod-1");
    expect(product).toBeDefined();
    expect(product!.name).toBe("Test Product");
  });

  it("returns undefined for nonexistent product ID", () => {
    const product = getProductById(TEST_CONFIG, "nonexistent");
    expect(product).toBeUndefined();
  });
});
