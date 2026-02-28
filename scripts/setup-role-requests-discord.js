require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

const ROOT = path.join(__dirname, '..');
const ARCH_FILE = path.join(ROOT, 'recruitment-architecture.json');
const STATE_FILE = path.join(ROOT, 'data', 'recruitment-architecture-state.json');

const CATEGORY_NAME = '🛂│запросы-ролей';

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getGuildConfig(guildId) {
  const raw = readJson(ARCH_FILE, { default: {}, guilds: {} });
  const defaults = raw.default || {};
  const guildOverride = (raw.guilds && raw.guilds[guildId]) || {};

  return {
    ...defaults,
    ...guildOverride,
    channels: {
      ...(defaults.channels || {}),
      ...(guildOverride.channels || {})
    },
    roles: {
      ...(defaults.roles || {}),
      ...(guildOverride.roles || {})
    }
  };
}

function byName(collection, name) {
  if (!name) return null;
  return collection.find(item => item.name === name) || null;
}

function mergeState(guildId, patch) {
  const state = readJson(STATE_FILE, { guilds: {} });
  state.guilds = state.guilds || {};
  state.guilds[guildId] = {
    ...(state.guilds[guildId] || {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
  writeJson(STATE_FILE, state);
}

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

    await guild.roles.fetch();
    await guild.channels.fetch();

    const cfg = getGuildConfig(guildId);

    const adminFull = byName(guild.roles.cache, cfg.roles && cfg.roles.adminFull);
    const adminMod = byName(guild.roles.cache, cfg.roles && cfg.roles.adminMod);
    const leaderRecruitment = byName(guild.roles.cache, cfg.roles && cfg.roles.leaderRecruitment);
    const deputyRecruitment = byName(guild.roles.cache, cfg.roles && cfg.roles.deputyRecruitment);

    if (!adminFull || !adminMod || !leaderRecruitment || !deputyRecruitment) {
      throw new Error('Missing one or more required roles (Admin Full/Mod, Leader/Deputy Recruitment).');
    }

    let category = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildCategory && ch.name === CATEGORY_NAME
    );

    if (!category) {
      category = await guild.channels.create({
        name: CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        reason: 'One-off role request workflow setup'
      });
      console.log(`Created category: ${CATEGORY_NAME} (${category.id})`);
    } else {
      console.log(`Using existing category: ${CATEGORY_NAME} (${category.id})`);
    }

    await category.permissionOverwrites.set([
      {
        id: guild.roles.everyone.id,
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: adminFull.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      },
      {
        id: adminMod.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      },
      {
        id: leaderRecruitment.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      },
      {
        id: deputyRecruitment.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      }
    ], 'One-off role request workflow setup');

    const roleRequestsName = (cfg.channels && cfg.channels.roleRequests) || '📝│запросы-ролей';
    const approvalsName = (cfg.channels && cfg.channels.approvals) || '🔐│одобрение-ролей';

    let roleRequestsChannel = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildText && ch.name === roleRequestsName
    );
    if (!roleRequestsChannel) {
      roleRequestsChannel = await guild.channels.create({
        name: roleRequestsName,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: 'One-off role request workflow setup'
      });
      console.log(`Created channel: ${roleRequestsName} (${roleRequestsChannel.id})`);
    } else {
      if (roleRequestsChannel.parentId !== category.id) {
        await roleRequestsChannel.setParent(category.id, { lockPermissions: false });
      }
      console.log(`Using existing channel: ${roleRequestsName} (${roleRequestsChannel.id})`);
    }

    await roleRequestsChannel.edit({ rateLimitPerUser: 5 }, 'One-off role request workflow setup');
    await roleRequestsChannel.permissionOverwrites.set([
      {
        id: guild.roles.everyone.id,
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: adminFull.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: []
      },
      {
        id: adminMod.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: []
      },
      {
        id: leaderRecruitment.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: []
      },
      {
        id: deputyRecruitment.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: []
      }
    ], 'One-off role request workflow setup');

    let approvalsChannel = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildText && ch.name === approvalsName
    );
    if (!approvalsChannel) {
      approvalsChannel = await guild.channels.create({
        name: approvalsName,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: 'One-off role request workflow setup'
      });
      console.log(`Created channel: ${approvalsName} (${approvalsChannel.id})`);
    } else {
      if (approvalsChannel.parentId !== category.id) {
        await approvalsChannel.setParent(category.id, { lockPermissions: false });
      }
      console.log(`Using existing channel: ${approvalsName} (${approvalsChannel.id})`);
    }

    await approvalsChannel.edit({ rateLimitPerUser: 0 }, 'One-off role request workflow setup');
    await approvalsChannel.permissionOverwrites.set([
      {
        id: guild.roles.everyone.id,
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: adminFull.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ],
        deny: []
      },
      {
        id: adminMod.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ],
        deny: []
      },
      {
        id: leaderRecruitment.id,
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: deputyRecruitment.id,
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel]
      }
    ], 'One-off role request workflow setup');

    mergeState(guildId, {
      roleRequestsCategoryId: category.id,
      roleRequestsChannelId: roleRequestsChannel.id,
      approvalsChannelId: approvalsChannel.id
    });

    console.log('One-off role request category setup completed.');
  } finally {
    await client.destroy();
  }
}

main().catch(err => {
  console.error('Role request one-off setup failed:', err);
  process.exitCode = 1;
});
