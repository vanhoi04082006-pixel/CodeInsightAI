import { webTools } from "@/lib/agent/tools/definitions/web-tools";

console.log(`Testing ${webTools.length} web tools...\n`);

for (const tool of webTools) {
  const name = tool.manifest.name;
  const caps = tool.manifest.capabilities.join(", ");
  const perm = tool.manifest.permission;
  console.log(`  ${name} [caps=${caps}, perm=${perm}]`);

  // Test search tools with a simple query
  if (name.includes("search")) {
    const result = await tool.execute({ query: "test", num: 2 }, {} as any);
    console.log(`    → ${result.ok ? "✓ ok (" + result.value.count + " results)" : "✗ " + result.error.message.slice(0, 80)}`);
  } else if (name === "read-docs") {
    const result = await tool.execute({ url: "https://example.com" }, {} as any);
    console.log(`    → ${result.ok ? "✓ ok (content: " + result.value.content.length + " chars)" : "✗ " + result.error.message.slice(0, 80)}`);
  }
}
