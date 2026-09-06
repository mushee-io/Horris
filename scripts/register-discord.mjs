const applicationId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!applicationId || !token) {
  console.error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required.");
  process.exit(1);
}

const commands = [
  {
    name: "help",
    description: "Show Horris commands and safety rules",
  },
  {
    name: "strategy",
    description: "Build a Horris strategy proposal without executing funds",
    options: [
      { name: "amount", description: "USDC amount", type: 10, required: true, min_value: 0.000001 },
      { name: "balance", description: "Available USDC balance", type: 10, required: true, min_value: 0 },
      {
        name: "risk",
        description: "Horris risk profile",
        type: 3,
        required: true,
        choices: [
          { name: "Conservative", value: "Conservative" },
          { name: "Balanced", value: "Balanced" },
          { name: "Aggressive", value: "Aggressive" },
        ],
      },
    ],
  },
  {
    name: "risk",
    description: "Check a proposed allocation against Horris policy",
    options: [
      { name: "amount", description: "USDC amount", type: 10, required: true, min_value: 0.000001 },
      { name: "balance", description: "Available USDC balance", type: 10, required: true, min_value: 0 },
      {
        name: "risk",
        description: "Horris risk profile",
        type: 3,
        required: true,
        choices: [
          { name: "Conservative", value: "Conservative" },
          { name: "Balanced", value: "Balanced" },
          { name: "Aggressive", value: "Aggressive" },
        ],
      },
    ],
  },
];

const base = `https://discord.com/api/v10/applications/${applicationId}`;
const endpoint = guildId ? `${base}/guilds/${guildId}/commands` : `${base}/commands`;

const response = await fetch(endpoint, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`Discord command registration failed (${response.status}).`, payload);
  process.exit(1);
}

console.log(`Registered ${Array.isArray(payload) ? payload.length : commands.length} Horris Discord commands${guildId ? ` in guild ${guildId}` : " globally"}.`);
