require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { setupRecruitmentForGuild } = require('../src/utils/recruitmentArchitectureManager');

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.GUILD_ID;

  if (!token) throw new Error('DISCORD_TOKEN missing in .env');
  if (!guildId) throw new Error('GUILD_ID missing in .env');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  });

  try {
    await client.login(token);
    const guild = await client.guilds.fetch(guildId);

    const result = await setupRecruitmentForGuild(
      guild,
      'setup-role-requests-discord.js',
      { dryRun: false }
    );

    console.log(`Canonical recruitment setup completed (${result.changes.length} changes).`);
    for (const line of result.changes) {
      console.log(`- ${line}`);
    }
  } finally {
    await client.destroy();
  }
}

main().catch(err => {
  console.error('Role request setup failed:', err);
  process.exitCode = 1;
});
