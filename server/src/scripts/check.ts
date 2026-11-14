// Connectivity check: verifies MongoDB and Anthropic credentials from .env
import { MongoClient } from "mongodb";
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const mongo = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db(process.env.MONGODB_DB || "protoforge");
  await db.command({ ping: 1 });
  const cols = await db.listCollections().toArray();
  console.log("mongo: ok, db =", db.databaseName, "collections =", cols.map((c) => c.name));
  await mongo.close();

  const client = new Anthropic();
  for (const model of [process.env.MODEL_HEAVY!, process.env.MODEL_FAST!]) {
    const t = Date.now();
    const r = await client.messages.create({ model, max_tokens: 20, messages: [{ role: "user", content: "Reply with just: ok" }] });
    const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    console.log(`anthropic ${model}: ${text.trim()} (${Date.now() - t}ms)`);
  }
}
main().catch((e) => { console.error("CHECK FAILED:", e?.message || e); process.exit(1); });
