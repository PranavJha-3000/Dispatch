import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";

// Generates docs/dispatch.postman_collection.json from docs/openapi.yaml: `npm run docs:postman -w server`.
const spec = parse(readFileSync("../docs/openapi.yaml", "utf8"));
const METHODS = ["get", "post", "patch", "put", "delete"];

const sample: Record<string, unknown> = {
  "post /api/auth/register": { name: "Demo User", email: "demo2@dispatch.dev", password: "Dispatch#2026" },
  "post /api/auth/login": { email: "demo@dispatch.dev", password: "Dispatch#2026" },
  "post /api/tickets": { title: "Cannot reset password", description: "The reset email never arrives.", category: "ACCOUNT", priority: "HIGH" },
  "patch /api/tickets/{id}": { title: "Updated title" },
  "patch /api/tickets/{id}/status": { status: "IN_PROGRESS" },
  "post /api/tickets/{id}/comments": { body: "Any update on this?" },
};

const folders = new Map<string, unknown[]>();
for (const [path, ops] of Object.entries<Record<string, { tags?: string[]; summary?: string }>>(spec.paths)) {
  for (const m of METHODS.filter((m) => ops[m])) {
    const op = ops[m]!;
    const key = `${m} ${path}`;
    const hasBody = key in sample;
    const item = {
      name: `${m.toUpperCase()} ${path} — ${op.summary ?? ""}`.slice(0, 120),
      request: {
        method: m.toUpperCase(),
        header: [
          { key: "X-Requested-With", value: "dispatch" },
          ...(hasBody ? [{ key: "Content-Type", value: "application/json" }] : []),
        ],
        ...(hasBody ? { body: { mode: "raw", raw: JSON.stringify(sample[key], null, 2) } } : {}),
        url: {
          raw: `{{baseUrl}}${path.replace(/\{(\w+)\}/g, ":$1")}`,
          host: ["{{baseUrl}}"],
          path: path.replace(/^\//, "").split("/").map((s) => s.replace(/\{(\w+)\}/, ":$1")),
        },
      },
    };
    const tag = op.tags?.[0] ?? "Other";
    folders.set(tag, [...(folders.get(tag) ?? []), item]);
  }
}

const collection = {
  info: {
    name: "Dispatch API",
    description: "Log in first (cookie auth is kept by Postman's cookie jar). All state-changing requests need X-Requested-With: dispatch.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [{ key: "baseUrl", value: "http://localhost:3000" }],
  item: [...folders].map(([name, item]) => ({ name, item })),
};
writeFileSync("../docs/dispatch.postman_collection.json", JSON.stringify(collection, null, 2));
console.log("wrote docs/dispatch.postman_collection.json");
