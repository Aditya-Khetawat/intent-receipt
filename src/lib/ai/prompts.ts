import fs from "node:fs";
import path from "node:path";

export interface Prompt {
  version: string;
  text: string;
}

const cache = new Map<string, Prompt>();

/** Loads a versioned prompt from /prompts (front matter `version:`). */
export function loadPrompt(name: "shop-agent" | "dispute-analyst"): Prompt {
  const hit = cache.get(name);
  if (hit) return hit;
  const raw = fs.readFileSync(path.join(process.cwd(), "prompts", `${name}.md`), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`prompt ${name} is missing front matter`);
  const version = m[1].match(/version:\s*(\S+)/)?.[1];
  if (!version) throw new Error(`prompt ${name} has no version`);
  const p = { version, text: m[2].trim() };
  cache.set(name, p);
  return p;
}
