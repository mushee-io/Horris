const applicationId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!applicationId || !token) {
  console.error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required.");
  process.exit(1);
}

const riskChoices = [
  { name: "Conservative", value: "Conservative" },
  { name: "Balanced", value: "Balanced" },
  { name: "Aggressive", value: "Aggressive" },
];
const commands = [
  { name: "help", description: "Show Horris commands and safety rules" },
  {
    name: "strategy",
    description: "Build a Horris strategy proposal without executing funds",
    options: [
      { name: "amount", description: "USDC amount", type: 10, required: true, min_value: 0.000001 },
      { name: "balance", description: "Available USDC balance", type: 10, required: true, min_value: 0 },
      { name: "risk", description: "Horris risk profile", type: 3, required: true, choices: riskChoices },
    ],
  },
  {
    name: "risk",
    description: "Check a proposed allocation against Horris policy",
    options: [
      { name: "amount", description: "USDC amount", type: 10, required: true, min_value: 0.000001 },
      { name: "balance", description: "Available USDC balance", type: 10, required: true, min_value: 0 },
      { name: "risk", description: "Horris risk profile", type: 3, required: true, choices: riskChoices },
    ],
  },
  {
    name: "perp-risk",
    description: "Analyze a Celo perpetual setup without signing or executing",
    options: [
      { name: "market", description: "UpDown market symbol, e.g. BTC", type: 3, required: true },
      { name: "side", description: "Position side", type: 3, required: true, choices: [{ name: "Long", value: "long" }, { name: "Short", value: "short" }] },
      { name: "balance", description: "Account balance in USD", type: 10, required: true, min_value: 0.000001 },
      { name: "margin", description: "Margin in USD", type: 10, required: true, min_value: 0.000001 },
      { name: "leverage", description: "Requested leverage", type: 10, required: true, min_value: 1 },
      { name: "entry", description: "Entry price", type: 10, required: true, min_value: 0.000001 },
      { name: "stop", description: "Stop-loss price", type: 10, required: true, min_value: 0.000001 },
      { name: "take_profit", description: "Optional take-profit price", type: 10, required: false, min_value: 0.000001 },
      { name: "risk", description: "Horris risk profile", type: 3, required: true, choices: riskChoices },
    ],
  },
  {
    name: "perp-status",
    description: "Read live UpDown positions and Horris protection status",
    options: [
      { name: "account", description: "Celo wallet address", type: 3, required: true },
    ],
  },
];

const base = `https://discord.com/api/v10/applications/${applicationId}`;
const endpoint = guildId ? `${base}/guilds/${guildId}/commands` : `${base}/commands`;
const response = await fetch(endpoint, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`Discord command registration failed (${response.status}).`, payload);
  process.exit(1);
}
console.log(`Registered ${Array.isArray(payload) ? payload.length : commands.length} Horris Discord commands${guildId ? ` in guild ${guildId}` : " globally"}.`);
