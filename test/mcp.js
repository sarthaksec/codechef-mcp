import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
});

const client = new Client({ name: "codechef-mcp-smoke", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`Discovered ${tools.length} tools:`);
for (const t of tools) {
  console.log(` - ${t.name}: ${t.description.split(".")[0]}.`);
}

const res = await client.callTool({
  name: "get_profile",
  arguments: { handle: "aryanc403" },
});
const text = res.content.find((c) => c.type === "text")?.text ?? "";
console.log("\nget_profile(aryanc403) ->");
console.log(text.slice(0, 700));

const bad = await client.callTool({
  name: "get_profile",
  arguments: { handle: "this_user_definitely_does_not_exist_9f3a" },
});
console.log("\nerror path ->", bad.isError, bad.content[0].text.slice(0, 120));

await client.close();
