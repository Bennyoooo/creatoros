import { CreatorConfig } from "./types";
import fs from "fs";
import path from "path";

const creatorsDir = path.join(process.cwd(), "creators");

export function getCreatorConfig(slug: string): CreatorConfig | null {
  const filePath = path.join(creatorsDir, `${slug}.json`);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CreatorConfig;
  } catch {
    return null;
  }
}

export function getProductById(
  config: CreatorConfig,
  productId: string
): CreatorConfig["products"][number] | undefined {
  return config.products.find((p) => p.id === productId);
}
