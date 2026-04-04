import { Client } from "@upstash/qstash";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const client = new Client({ token: process.env.QSTASH_TOKEN! });

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://txb-unibox.vercel.app";

async function setupSchedules() {
  console.log(`Setting up QStash schedules for: ${BASE_URL}`);

  // List existing schedules
  const existing = await client.schedules.list();
  console.log(`Existing schedules: ${existing.length}`);

  // Delete all existing to start fresh
  for (const schedule of existing) {
    await client.schedules.delete(schedule.scheduleId);
    console.log(`  Deleted: ${schedule.scheduleId}`);
  }

  // Campaign processor — every 15 minutes
  const campaign = await client.schedules.create({
    destination: `${BASE_URL}/api/campaigns/process`,
    cron: "*/15 * * * *",
    method: "POST",
    body: JSON.stringify({ source: "qstash" }),
    headers: { "Content-Type": "application/json" },
  });
  console.log(`Campaign cron created: ${campaign.scheduleId}`);

  // Webhook processor — every 2 minutes
  const webhook = await client.schedules.create({
    destination: `${BASE_URL}/api/cron/process-webhooks`,
    cron: "*/2 * * * *",
    method: "POST",
    body: JSON.stringify({ source: "qstash" }),
    headers: { "Content-Type": "application/json" },
  });
  console.log(`Webhook cron created: ${webhook.scheduleId}`);

  // Cleanup — daily at 3 AM
  const cleanup = await client.schedules.create({
    destination: `${BASE_URL}/api/cron/cleanup-tracking`,
    cron: "0 3 * * *",
    method: "POST",
    body: JSON.stringify({ source: "qstash" }),
    headers: { "Content-Type": "application/json" },
  });
  console.log(`Cleanup cron created: ${cleanup.scheduleId}`);

  // Watch renewal — every 3 days at 3 AM
  const watches = await client.schedules.create({
    destination: `${BASE_URL}/api/cron/renew-gmail-watches`,
    cron: "0 3 */3 * *",
    method: "POST",
    body: JSON.stringify({ source: "qstash" }),
    headers: { "Content-Type": "application/json" },
  });
  console.log(`Watch renewal cron created: ${watches.scheduleId}`);

  // Automations — every hour
  const automations = await client.schedules.create({
    destination: `${BASE_URL}/api/cron/automations`,
    cron: "0 * * * *",
    method: "POST",
    body: JSON.stringify({ source: "qstash" }),
    headers: { "Content-Type": "application/json" },
  });
  console.log(`Automations cron created: ${automations.scheduleId}`);

  // IMAP polling — every 15 minutes
  const imapSync = await client.schedules.create({
    destination: `${BASE_URL}/api/cron/sync-imap`,
    cron: "*/15 * * * *",
    method: "POST",
    body: JSON.stringify({ source: "qstash" }),
    headers: { "Content-Type": "application/json" },
  });
  console.log(`IMAP sync cron created: ${imapSync.scheduleId}`);

  console.log("\n✅ QStash schedules setup complete!");
}

setupSchedules().catch(console.error);
