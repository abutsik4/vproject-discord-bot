const fs = require('node:fs');
const path = require('node:path');
const {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField
} = require('discord.js');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'recruitment-architecture.json');
const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'recruitment-architecture-state.json');

const PACK_CHOICES = {
  admin_full: 'adminFull',
  admin_mod: 'adminMod',
  dev_tech: 'devTech',
  leader_recruitment: 'leaderRecruitment',
  deputy_recruitment: 'deputyRecruitment',
  member_base: 'memberBase'
};

const PACK_GLOBAL_PERMISSIONS = {
  adminFull: [PermissionFlagsBits.Administrator],
  adminMod: [],
  devTech: [],
  leaderRecruitment: [],
  deputyRecruitment: [],
  memberBase: []
};

const WORKFLOW_REQUEST_AUDIENCES = new Set(['all_members', 'staff_only']);
const WORKFLOW_CATEGORY_VISIBILITY = new Set(['public', 'restricted']);

const DEFAULT_ROLE_REQUEST_MESSAGES = {
  requesterCreatedReply: 'Запрос создан. Ожидайте решение администратора в канале одобрения.',
  approvalsCreatedPost:
    '📝 Новый запрос на роль: {packLabel} для {targetMention} (инициатор: {requesterMention}).\n' +
    'Причина: {reason}\n\n' +
    'Чтобы принять решение, ответьте на это сообщение: `!одобрить` или `!отклонить причина`.',
  approvalsDecisionPost:
    '{statusEmoji} Запрос {statusPast} администратором {approverMention} для {targetMention} ({packLabel}).{decisionReasonLine}',
  requestsDecisionPost:
    '📣 Запрос для {targetMention} ({packLabel}) {statusPastLower}.{decisionReasonLine}'
};

function normaliseRoleRequestMessages(rawMessages) {
  const incoming = rawMessages && typeof rawMessages === 'object' ? rawMessages : {};
  const out = { ...DEFAULT_ROLE_REQUEST_MESSAGES };

  for (const key of Object.keys(DEFAULT_ROLE_REQUEST_MESSAGES)) {
    if (typeof incoming[key] === 'string') {
      out[key] = incoming[key];
    }
  }

  return out;
}

function normaliseRoleStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v || '').trim()).filter(Boolean);
  }
  if (value == null) return [];
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function normaliseWorkflowPolicy(rawWorkflow, cfgRoles = {}) {
  const workflow = rawWorkflow && typeof rawWorkflow === 'object' ? rawWorkflow : {};
  const requestAudience = WORKFLOW_REQUEST_AUDIENCES.has(workflow.requestAudience)
    ? workflow.requestAudience
    : 'all_members';
  const categoryVisibility = WORKFLOW_CATEGORY_VISIBILITY.has(workflow.categoryVisibility)
    ? workflow.categoryVisibility
    : 'public';

  const approverRoleNames = normaliseRoleStringArray(workflow.approverRoleNames);
  const approverRoleIds = normaliseRoleStringArray(workflow.approverRoleIds)
    .filter(v => /^\d{17,20}$/.test(v));

  const seededApproverNames = new Set([
    cfgRoles.adminFull,
    cfgRoles.adminMod,
    ...approverRoleNames,
    'Модератор Discord'
  ].map(v => String(v || '').trim()).filter(Boolean));

  return {
    requestAudience,
    categoryVisibility,
    approverRoleNames: [...seededApproverNames],
    approverRoleIds
  };
}

function ensureJsonFile(filePath, fallbackObject) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackObject, null, 2), 'utf8');
  }
}

function loadConfig() {
  ensureJsonFile(CONFIG_FILE, { default: {}, guilds: {} });
  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const defaults = raw.default || {};
  const guilds = raw.guilds || {};

  return {
    defaults,
    guilds
  };
}

function loadRawConfig() {
  ensureJsonFile(CONFIG_FILE, { default: {}, guilds: {} });
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveRawConfig(rawConfig) {
  ensureJsonFile(CONFIG_FILE, { default: {}, guilds: {} });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(rawConfig, null, 2), 'utf8');
}

function getGuildConfig(guildId) {
  const cfg = loadConfig();
  const guildCfg = cfg.guilds[guildId] || {};
  const merged = {
    ...cfg.defaults,
    ...guildCfg,
    channels: {
      ...(cfg.defaults.channels || {}),
      ...(guildCfg.channels || {})
    },
    roles: {
      ...(cfg.defaults.roles || {}),
      ...(guildCfg.roles || {})
    },
    messages: {
      ...(cfg.defaults.messages || {}),
      ...(guildCfg.messages || {})
    },
    pins: {
      ...(cfg.defaults.pins || {}),
      ...(guildCfg.pins || {})
    }
  };

  merged.workflow = normaliseWorkflowPolicy(
    {
      ...(cfg.defaults.workflow || {}),
      ...(guildCfg.workflow || {})
    },
    merged.roles || {}
  );

  merged.messages = normaliseRoleRequestMessages(merged.messages);

  return merged;
}

function getRecruitmentMessageTemplates(guildId) {
  const cfg = getGuildConfig(guildId);
  return normaliseRoleRequestMessages(cfg.messages);
}

function saveRecruitmentMessageTemplates(guildId, messagesPatch = {}) {
  const raw = loadRawConfig();
  raw.guilds = raw.guilds || {};
  raw.guilds[guildId] = raw.guilds[guildId] || {};

  const current = getRecruitmentMessageTemplates(guildId);
  const next = normaliseRoleRequestMessages({
    ...current,
    ...(messagesPatch && typeof messagesPatch === 'object' ? messagesPatch : {})
  });

  raw.guilds[guildId].messages = next;
  saveRawConfig(raw);
  return next;
}

function getRecruitmentWorkflowPolicy(guildId) {
  const cfg = getGuildConfig(guildId);
  return normaliseWorkflowPolicy(cfg.workflow || {}, cfg.roles || {});
}

function saveRecruitmentWorkflowPolicy(guildId, workflowPatch = {}) {
  const raw = loadRawConfig();
  raw.guilds = raw.guilds || {};
  raw.guilds[guildId] = raw.guilds[guildId] || {};

  const current = getRecruitmentWorkflowPolicy(guildId);
  const next = normaliseWorkflowPolicy(
    {
      ...current,
      ...(workflowPatch && typeof workflowPatch === 'object' ? workflowPatch : {})
    },
    {
      ...((raw.default && raw.default.roles) || {}),
      ...((raw.guilds[guildId] && raw.guilds[guildId].roles) || {})
    }
  );

  raw.guilds[guildId].workflow = next;
  saveRawConfig(raw);
  return next;
}

function loadState() {
  ensureJsonFile(STATE_FILE, { guilds: {} });
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  ensureJsonFile(STATE_FILE, { guilds: {} });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function logChange(changes, text) {
  changes.push(text);
  console.log(`[RecruitmentManager] ${text}`);
}

async function sendOptionalLog(guild, config, text) {
  const channelId = config.logChannelId;
  if (!channelId) return;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    await channel.send(`🧩 RecruitmentManager: ${text}`);
  } catch {
    // ignore optional logging failures
  }
}

function findChannel(guild, name, type) {
  return guild.channels.cache.find(ch => ch.name === name && ch.type === type) || null;
}

function normaliseRoleNameForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s|()_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findRoleByConfiguredName(guild, configuredName) {
  const targetRaw = String(configuredName || '').trim();
  if (!targetRaw) return null;

  const exact = guild.roles.cache.find(r => r.name === targetRaw) || null;
  if (exact) return exact;

  const target = normaliseRoleNameForMatch(targetRaw);
  if (!target) return null;

  return guild.roles.cache.find(role => {
    const roleName = normaliseRoleNameForMatch(role.name);
    return roleName === target || roleName.includes(target);
  }) || null;
}

async function ensureRole(guild, me, name, permissions, changes, dryRun) {
  let role = guild.roles.cache.find(r => r.name === name) || null;
  const desiredPerms = new PermissionsBitField(permissions || []);

  if (role && role.position >= me.roles.highest.position) {
    throw new Error(
      `Cannot manage role "${name}" because it is above or equal to bot top role. Move bot role higher in Discord settings.`
    );
  }

  if (!role) {
    if (dryRun) {
      logChange(changes, `Would create role: ${name}`);
      return null;
    }
    role = await guild.roles.create({
      name,
      permissions: desiredPerms,
      mentionable: false,
      reason: 'Recruitment architecture setup'
    });
    logChange(changes, `Created role: ${name}`);
    return role;
  }

  if (!role.permissions.equals(desiredPerms)) {
    if (dryRun) {
      logChange(changes, `Would update permissions for role: ${name}`);
    } else {
      await role.setPermissions(desiredPerms, 'Recruitment architecture setup');
      logChange(changes, `Updated permissions for role: ${name}`);
    }
  }

  return role;
}

async function ensurePingRole(guild, me, name, changes, dryRun) {
  let role = guild.roles.cache.find(r => r.name === name) || null;

  if (role && role.position >= me.roles.highest.position) {
    throw new Error(
      `Cannot manage role "${name}" because it is above or equal to bot top role.`
    );
  }

  if (!role) {
    if (dryRun) {
      logChange(changes, `Would create role: ${name}`);
      return null;
    }
    role = await guild.roles.create({
      name,
      permissions: [],
      mentionable: true,
      reason: 'Recruitment architecture setup'
    });
    logChange(changes, `Created role: ${name}`);
    return role;
  }

  if (!role.mentionable) {
    if (dryRun) {
      logChange(changes, `Would set mentionable=true for role: ${name}`);
    } else {
      await role.setMentionable(true, 'Recruitment architecture setup');
      logChange(changes, `Updated mentionable=true for role: ${name}`);
    }
  }

  return role;
}

async function ensureCategory(guild, categoryName, categoryOverwrites, changes, dryRun) {
  let category = findChannel(guild, categoryName, ChannelType.GuildCategory);
  if (!category) {
    if (dryRun) {
      logChange(changes, `Would create category: ${categoryName}`);
      return null;
    }

    category = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      reason: 'Recruitment architecture setup'
    });
    logChange(changes, `Created category: ${categoryName}`);
  }

  const existingOverwrites = category.permissionOverwrites.cache;
  const overwriteSignature = JSON.stringify(
    (categoryOverwrites || [])
      .map(ow => ({
        id: ow.id,
        allow: new PermissionsBitField(ow.allow || []).bitfield.toString(),
        deny: new PermissionsBitField(ow.deny || []).bitfield.toString()
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );

  const currentSignature = JSON.stringify(
    existingOverwrites
      .map(ow => ({
        id: ow.id,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString()
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );

  if (overwriteSignature !== currentSignature) {
    if (dryRun) {
      logChange(changes, `Would update permission overwrites: ${categoryName}`);
    } else {
      await category.permissionOverwrites.set(
        categoryOverwrites || [],
        'Recruitment architecture setup'
      );
      logChange(changes, `Updated permission overwrites: ${categoryName}`);
    }
  }

  return category;
}

async function ensureChannel(guild, opts) {
  const {
    name,
    type,
    category,
    slowmode,
    overwrites,
    changes,
    dryRun
  } = opts;

  let channel = findChannel(guild, name, type);

  if (!channel) {
    if (dryRun) {
      logChange(changes, `Would create channel: ${name}`);
      return null;
    }

    channel = await guild.channels.create({
      name,
      type,
      parent: category ? category.id : null,
      reason: 'Recruitment architecture setup'
    });
    logChange(changes, `Created channel: ${name}`);
  }

  const editPayload = {};
  if (category && channel.parentId !== category.id) {
    editPayload.parent = category.id;
  }

  if (type === ChannelType.GuildText) {
    const desiredSlowmode = Number(slowmode || 0);
    if (channel.rateLimitPerUser !== desiredSlowmode) {
      editPayload.rateLimitPerUser = desiredSlowmode;
    }
  }

  if (Object.keys(editPayload).length) {
    if (dryRun) {
      logChange(changes, `Would update channel settings: ${name}`);
    } else {
      await channel.edit(editPayload, 'Recruitment architecture setup');
      logChange(changes, `Updated channel settings: ${name}`);
    }
  }

  const existingOverwrites = channel.permissionOverwrites.cache;
  const overwriteSignature = JSON.stringify(
    overwrites
      .map(ow => ({
        id: ow.id,
        allow: new PermissionsBitField(ow.allow || []).bitfield.toString(),
        deny: new PermissionsBitField(ow.deny || []).bitfield.toString()
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );

  const currentSignature = JSON.stringify(
    existingOverwrites
      .map(ow => ({
        id: ow.id,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString()
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );

  if (overwriteSignature !== currentSignature) {
    if (dryRun) {
      logChange(changes, `Would update permission overwrites: ${name}`);
    } else {
      await channel.permissionOverwrites.set(overwrites, 'Recruitment architecture setup');
      logChange(changes, `Updated permission overwrites: ${name}`);
    }
  }

  return channel;
}

async function ensurePinnedMessage(channel, marker, content, changes, dryRun) {
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const desired = `${marker}\n${content.replace(/^\[[^\]]+\]\n?/, '')}`;

  if (dryRun) {
    logChange(changes, `Would ensure pinned message in ${channel.name}: ${marker}`);
    return;
  }

  const pinnedRaw = channel.messages.fetchPins
    ? await channel.messages.fetchPins()
    : await channel.messages.fetchPinned();
  const pinnedList = (Array.isArray(pinnedRaw)
    ? pinnedRaw
    : (pinnedRaw && Array.isArray(pinnedRaw.items))
      ? pinnedRaw.items
      : (pinnedRaw && typeof pinnedRaw.values === 'function')
        ? [...pinnedRaw.values()]
        : [])
    .map(item => (item && item.message ? item.message : item))
    .filter(item => item && item.author && typeof item.content === 'string');
  let target = pinnedList.find(msg => msg.author.id === channel.client.user.id && msg.content.startsWith(marker));

  if (!target) {
    target = await channel.send(desired);
    await target.pin('Recruitment architecture setup');
    logChange(changes, `Pinned new template/rules message in ${channel.name}: ${marker}`);
    return;
  }

  if (target.content !== desired) {
    await target.edit(desired);
    logChange(changes, `Updated pinned message in ${channel.name}: ${marker}`);
  }
}

function validateBotPermissions(guild) {
  const me = guild.members.me;
  if (!me) {
    throw new Error('Unable to resolve bot member in guild.');
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Bot lacks Manage Channels permission. Grant it before running setup.');
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Bot lacks Manage Roles permission. Grant it before running setup.');
  }

  return me;
}

function buildOverwrites(guild, roleMap, workflowPolicy, extraRoleMap = {}) {
  const everyone = guild.roles.everyone.id;
  const canAllMembersRequest = workflowPolicy.requestAudience === 'all_members';
  const isCategoryPublic = workflowPolicy.categoryVisibility !== 'restricted';
  const approverRoleIds = new Set([
    roleMap.adminFull && roleMap.adminFull.id,
    roleMap.adminMod && roleMap.adminMod.id,
    ...(Array.isArray(extraRoleMap.approverRoleIds) ? extraRoleMap.approverRoleIds : [])
  ].filter(Boolean));

  const readOnlyBase = {
    id: everyone,
    allow: [PermissionFlagsBits.ViewChannel],
    deny: [
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.MentionEveryone
    ]
  };

  return {
    category: [
      {
        id: everyone,
        allow: isCategoryPublic ? [PermissionFlagsBits.ViewChannel] : [],
        deny: isCategoryPublic ? [] : [PermissionFlagsBits.ViewChannel]
      },
      {
        id: roleMap.adminFull.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      },
      {
        id: roleMap.adminMod.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      },
      {
        id: roleMap.devTech.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      },
      {
        id: roleMap.leaderRecruitment.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      },
      {
        id: roleMap.deputyRecruitment.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      },
      {
        id: roleMap.memberBase.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: []
      }
    ],
    guide: [
      readOnlyBase,
      {
        id: roleMap.adminFull.id,
        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
        deny: []
      },
      {
        id: roleMap.adminMod.id,
        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
        deny: []
      }
    ],
    feed: [
      readOnlyBase,
      {
        id: roleMap.leaderRecruitment.id,
        allow: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles
        ],
        deny: [PermissionFlagsBits.MentionEveryone]
      },
      {
        id: roleMap.deputyRecruitment.id,
        allow: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles
        ],
        deny: [PermissionFlagsBits.MentionEveryone]
      }
    ],
    questions: [
      {
        id: everyone,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions
        ],
        deny: [
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.CreatePrivateThreads
        ]
      }
    ],
    interview: [
      {
        id: everyone,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak
        ],
        deny: []
      },
      {
        id: roleMap.leaderRecruitment.id,
        allow: [
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers
        ],
        deny: []
      },
      {
        id: roleMap.deputyRecruitment.id,
        allow: [
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers
        ],
        deny: []
      }
    ],
    waiting: [
      {
        id: everyone,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        deny: [PermissionFlagsBits.Speak]
      },
      {
        id: roleMap.leaderRecruitment.id,
        allow: [PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers],
        deny: []
      },
      {
        id: roleMap.deputyRecruitment.id,
        allow: [PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers],
        deny: []
      }
    ],
    roleRequests: [
      {
        id: everyone,
        allow: canAllMembersRequest
          ? [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory
          ]
          : [],
        deny: canAllMembersRequest
          ? [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.CreatePrivateThreads
          ]
          : [PermissionFlagsBits.ViewChannel]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory
        ],
        deny: []
      },
      {
        id: roleMap.adminFull.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ],
        deny: [
          PermissionFlagsBits.SendMessages
        ]
      },
      {
        id: roleMap.adminMod.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ],
        deny: [
          PermissionFlagsBits.SendMessages
        ]
      },
      {
        id: roleMap.leaderRecruitment.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ],
        deny: [
          PermissionFlagsBits.SendMessages
        ]
      },
      {
        id: roleMap.deputyRecruitment.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ],
        deny: [
          PermissionFlagsBits.SendMessages
        ]
      }
    ],
    approvals: [
      {
        id: everyone,
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
      },
      {
        id: roleMap.leaderRecruitment.id,
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
      },
      {
        id: roleMap.deputyRecruitment.id,
        allow: [],
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
      },
      ...[...approverRoleIds].map(roleId => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ],
        deny: []
      }))
    ]
  };
}

async function setupRecruitmentArchitecture(interaction, options = {}) {
  const guild = interaction.guild;
  const actorTag = interaction.user && interaction.user.tag
    ? interaction.user.tag
    : 'slash-command';

  return setupRecruitmentForGuild(guild, actorTag, options);
}

async function setupRecruitmentForGuild(guild, actorTag = 'system', options = {}) {
  if (!guild) {
    throw new Error('This command can only be used inside a guild.');
  }

  await guild.roles.fetch();
  await guild.channels.fetch();

  const cfg = getGuildConfig(guild.id);
  const dryRun = options.dryRun === true || cfg.dryRun === true;
  const changes = [];
  const workflowPolicy = getRecruitmentWorkflowPolicy(guild.id);

  const me = validateBotPermissions(guild);

  const roleMap = {};
  roleMap.adminFull = await ensureRole(
    guild,
    me,
    cfg.roles.adminFull,
    PACK_GLOBAL_PERMISSIONS.adminFull,
    changes,
    dryRun
  );
  roleMap.adminMod = await ensureRole(
    guild,
    me,
    cfg.roles.adminMod,
    PACK_GLOBAL_PERMISSIONS.adminMod,
    changes,
    dryRun
  );
  roleMap.devTech = await ensureRole(
    guild,
    me,
    cfg.roles.devTech,
    PACK_GLOBAL_PERMISSIONS.devTech,
    changes,
    dryRun
  );
  roleMap.leaderRecruitment = await ensureRole(
    guild,
    me,
    cfg.roles.leaderRecruitment,
    PACK_GLOBAL_PERMISSIONS.leaderRecruitment,
    changes,
    dryRun
  );
  roleMap.deputyRecruitment = await ensureRole(
    guild,
    me,
    cfg.roles.deputyRecruitment,
    PACK_GLOBAL_PERMISSIONS.deputyRecruitment,
    changes,
    dryRun
  );
  roleMap.memberBase = await ensureRole(
    guild,
    me,
    cfg.roles.memberBase,
    PACK_GLOBAL_PERMISSIONS.memberBase,
    changes,
    dryRun
  );
  roleMap.optInPing = await ensurePingRole(
    guild,
    me,
    cfg.roles.optInPing,
    changes,
    dryRun
  );

  const missingRole = Object.entries(roleMap).find(([, value]) => !value);
  if (dryRun && missingRole) {
    // For dry-run mode with role creations, build temporary placeholders for overwrite simulation.
    for (const key of Object.keys(roleMap)) {
      if (!roleMap[key]) roleMap[key] = { id: `dry-${key}` };
    }
  }

  const approverRolesByName = (workflowPolicy.approverRoleNames || [])
    .map(name => findRoleByConfiguredName(guild, name))
    .filter(Boolean);
  const approverRolesById = (workflowPolicy.approverRoleIds || [])
    .map(roleId => guild.roles.cache.get(roleId) || null)
    .filter(Boolean);

  const workflowApproverRoleIds = [...new Set([
    ...approverRolesByName.map(r => r.id),
    ...approverRolesById.map(r => r.id)
  ])];

  if ((workflowPolicy.approverRoleNames || []).length > approverRolesByName.length) {
    const missingApprovers = (workflowPolicy.approverRoleNames || []).filter(
      roleName => !approverRolesByName.some(role => role.name === roleName)
    );
    if (missingApprovers.length > 0) {
      logChange(
        changes,
        `Approver roles not found by name: ${missingApprovers.join(', ')} (skipping missing roles)`
      );
    }
  }

  if ((workflowPolicy.approverRoleIds || []).length > approverRolesById.length) {
    const missingApproverIds = (workflowPolicy.approverRoleIds || []).filter(
      roleId => !approverRolesById.some(role => role.id === roleId)
    );
    if (missingApproverIds.length > 0) {
      logChange(
        changes,
        `Approver roles not found by ID: ${missingApproverIds.join(', ')} (skipping missing roles)`
      );
    }
  }

  const overwrites = buildOverwrites(guild, roleMap, workflowPolicy, {
    approverRoleIds: workflowApproverRoleIds
  });
  const category = await ensureCategory(
    guild,
    cfg.categoryName,
    overwrites.category,
    changes,
    dryRun
  );

  const channels = cfg.channels;
  const guide = await ensureChannel(guild, {
    name: channels.guide,
    type: ChannelType.GuildText,
    category,
    slowmode: 0,
    overwrites: overwrites.guide,
    changes,
    dryRun
  });

  const feed = await ensureChannel(guild, {
    name: channels.feed,
    type: ChannelType.GuildText,
    category,
    slowmode: 21600,
    overwrites: overwrites.feed,
    changes,
    dryRun
  });

  const questionsSlowmode = Number(cfg.questionsSlowmodeSec || 60);
  const questions = await ensureChannel(guild, {
    name: channels.questions,
    type: ChannelType.GuildText,
    category,
    slowmode: questionsSlowmode,
    overwrites: overwrites.questions,
    changes,
    dryRun
  });

  const interview1 = await ensureChannel(guild, {
    name: channels.interview1,
    type: ChannelType.GuildVoice,
    category,
    overwrites: overwrites.interview,
    changes,
    dryRun
  });

  const interview2 = await ensureChannel(guild, {
    name: channels.interview2,
    type: ChannelType.GuildVoice,
    category,
    overwrites: overwrites.interview,
    changes,
    dryRun
  });

  const leaderTalk = await ensureChannel(guild, {
    name: channels.leaderTalk,
    type: ChannelType.GuildVoice,
    category,
    overwrites: overwrites.interview,
    changes,
    dryRun
  });

  const waiting = await ensureChannel(guild, {
    name: channels.waiting,
    type: ChannelType.GuildVoice,
    category,
    overwrites: overwrites.waiting,
    changes,
    dryRun
  });

  const roleRequestsChannelName = channels.roleRequests || '📝│запросы-ролей';
  const roleRequests = await ensureChannel(guild, {
    name: roleRequestsChannelName,
    type: ChannelType.GuildText,
    category,
    slowmode: 5,
    overwrites: overwrites.roleRequests,
    changes,
    dryRun
  });

  const approvalsChannelName = channels.approvals || '🔐│одобрение-ролей';
  const approvals = await ensureChannel(guild, {
    name: approvalsChannelName,
    type: ChannelType.GuildText,
    category,
    slowmode: 0,
    overwrites: overwrites.approvals,
    changes,
    dryRun
  });
  if (!dryRun) {
    await ensurePinnedMessage(guide, '[RECRUITMENT_RULES_V1]', cfg.pins.rules || '', changes, dryRun);
    await ensurePinnedMessage(guide, '[RECRUITMENT_TEMPLATE_V1]', cfg.pins.template || '', changes, dryRun);

    const state = loadState();
    state.guilds = state.guilds || {};
    state.guilds[guild.id] = {
      categoryId: category ? category.id : null,
      announcementChannelId: feed ? feed.id : null,
      guideChannelId: guide ? guide.id : null,
      questionsChannelId: questions ? questions.id : null,
      roleRequestsChannelId: roleRequests ? roleRequests.id : null,
      voiceChannelIds: [interview1?.id, interview2?.id, leaderTalk?.id, waiting?.id].filter(Boolean),
      approvalsChannelId: approvals ? approvals.id : null,
      roleIds: {
        adminFull: roleMap.adminFull?.id || null,
        adminMod: roleMap.adminMod?.id || null,
        devTech: roleMap.devTech?.id || null,
        leaderRecruitment: roleMap.leaderRecruitment?.id || null,
        deputyRecruitment: roleMap.deputyRecruitment?.id || null,
        memberBase: roleMap.memberBase?.id || null,
        optInPing: roleMap.optInPing?.id || null,
        workflowApprovers: workflowApproverRoleIds
      },
      updatedAt: new Date().toISOString()
    };
    saveState(state);

    await sendOptionalLog(
      guild,
      cfg,
      `Setup completed by ${actorTag}. Category: ${cfg.categoryName}, announcement channel: ${channels.feed}`
    );
  }

  if (changes.length === 0) {
    changes.push('No changes required. Architecture already up to date.');
  }

  return {
    dryRun,
    changes,
    config: cfg
  };
}

function resolvePackKey(packChoice) {
  const key = PACK_CHOICES[packChoice];
  if (!key) {
    throw new Error(`Unknown pack: ${packChoice}`);
  }
  return key;
}

async function assignPackRole(interaction, options) {
  const { user, packChoice, mode = 'add' } = options;
  const guild = interaction.guild;
  const actorTag = interaction.user && interaction.user.tag
    ? interaction.user.tag
    : 'slash-command';

  return assignPackRoleForGuild(guild, actorTag, user.id, packChoice, mode);
}

async function assignPackRoleForGuild(guild, actorTag, userId, packChoice, mode = 'add') {
  if (!guild) {
    throw new Error('This command can only be used inside a guild.');
  }

  await guild.roles.fetch();
  const member = await guild.members.fetch(userId);

  const cfg = getGuildConfig(guild.id);
  const me = validateBotPermissions(guild);

  const packKey = resolvePackKey(packChoice);
  const roleName = cfg.roles[packKey];
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    throw new Error(
      `Pack role "${roleName}" does not exist yet. Run /setup_recruitment first.`
    );
  }

  if (role.position >= me.roles.highest.position) {
    throw new Error(
      `Cannot manage role "${roleName}" because it is above or equal to bot role.`
    );
  }

  if (mode === 'remove') {
    if (!member.roles.cache.has(role.id)) {
      return {
        changed: false,
        message: `${member.user.tag} does not have ${role.name}.`
      };
    }
    await member.roles.remove(role, `Pack removal by ${actorTag}`);
    return {
      changed: true,
      message: `Removed pack role ${role.name} from ${member.user.tag}.`
    };
  }

  if (member.roles.cache.has(role.id)) {
    return {
      changed: false,
      message: `${member.user.tag} already has ${role.name}.`
    };
  }

  await member.roles.add(role, `Pack assignment by ${actorTag}`);
  return {
    changed: true,
    message: `Assigned pack role ${role.name} to ${member.user.tag}.`
  };
}

function getRecruitmentStateForGuild(guildId) {
  const state = loadState();
  return (state.guilds && state.guilds[guildId]) || null;
}

function saveRecruitmentStateForGuild(guildId, patch) {
  const state = loadState();
  state.guilds = state.guilds || {};
  state.guilds[guildId] = state.guilds[guildId] || {};
  Object.assign(state.guilds[guildId], patch);
  state.guilds[guildId].updatedAt = new Date().toISOString();
  saveState(state);
}

function stripMarkerPrefix(content, marker) {
  const text = String(content || '').trim();
  if (text.startsWith(`${marker}\n`)) {
    return text.slice(marker.length + 1);
  }
  if (text.startsWith(marker)) {
    return text.slice(marker.length).trimStart();
  }
  return text;
}

async function saveDefaultSnapshotForGuild(guild, options = {}) {
  if (!guild) {
    throw new Error('Guild is required.');
  }

  await guild.roles.fetch();
  await guild.channels.fetch();

  const cfg = getGuildConfig(guild.id);
  const state = getRecruitmentStateForGuild(guild.id) || {};

  const categoryId = options.categoryId || state.categoryId || null;
  let category = null;
  if (categoryId) {
    category = guild.channels.cache.get(categoryId) || null;
    if (category && category.type !== ChannelType.GuildCategory) {
      throw new Error(`Channel ${categoryId} is not a category.`);
    }
  }

  if (!category) {
    category = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildCategory && ch.name === cfg.categoryName
    ) || null;
  }

  if (!category) {
    throw new Error('Recruitment category not found. Provide a valid category ID.');
  }

  const readTextChannelName = channelId => {
    const ch = channelId ? guild.channels.cache.get(channelId) : null;
    return ch && ch.type === ChannelType.GuildText ? ch.name : null;
  };

  const readVoiceChannelName = channelId => {
    const ch = channelId ? guild.channels.cache.get(channelId) : null;
    return ch && ch.type === ChannelType.GuildVoice ? ch.name : null;
  };

  const channelSnapshot = {
    ...cfg.channels
  };

  const guideChannel = guild.channels.cache.get(state.guideChannelId || '');
  const feedChannel = guild.channels.cache.get(state.announcementChannelId || '');
  const questionsChannel = guild.channels.cache.get(state.questionsChannelId || '');
  const voiceIds = Array.isArray(state.voiceChannelIds) ? state.voiceChannelIds : [];

  channelSnapshot.guide = readTextChannelName(state.guideChannelId) || channelSnapshot.guide;
  channelSnapshot.feed = readTextChannelName(state.announcementChannelId) || channelSnapshot.feed;
  channelSnapshot.questions = readTextChannelName(state.questionsChannelId) || channelSnapshot.questions;
  channelSnapshot.interview1 = readVoiceChannelName(voiceIds[0]) || channelSnapshot.interview1;
  channelSnapshot.interview2 = readVoiceChannelName(voiceIds[1]) || channelSnapshot.interview2;
  channelSnapshot.leaderTalk = readVoiceChannelName(voiceIds[2]) || channelSnapshot.leaderTalk;
  channelSnapshot.waiting = readVoiceChannelName(voiceIds[3]) || channelSnapshot.waiting;
  channelSnapshot.roleRequests = readTextChannelName(state.roleRequestsChannelId) || channelSnapshot.roleRequests;
  channelSnapshot.approvals = readTextChannelName(state.approvalsChannelId) || channelSnapshot.approvals;

  const roleSnapshot = {
    ...cfg.roles
  };

  const roleIds = (state && state.roleIds) || {};
  for (const [key, roleId] of Object.entries(roleIds)) {
    if (!roleId) continue;
    const role = guild.roles.cache.get(roleId);
    if (role) roleSnapshot[key] = role.name;
  }

  const pinsSnapshot = {
    ...cfg.pins
  };
  if (guideChannel && guideChannel.type === ChannelType.GuildText) {
    const pinned = await guideChannel.messages.fetchPinned();
    const rulesMessage = pinned.find(
      msg => msg.author.id === guild.client.user.id && msg.content.startsWith('[RECRUITMENT_RULES_V1]')
    );
    const templateMessage = pinned.find(
      msg => msg.author.id === guild.client.user.id && msg.content.startsWith('[RECRUITMENT_TEMPLATE_V1]')
    );

    if (rulesMessage) {
      pinsSnapshot.rules = stripMarkerPrefix(rulesMessage.content, '[RECRUITMENT_RULES_V1]');
    }
    if (templateMessage) {
      pinsSnapshot.template = stripMarkerPrefix(templateMessage.content, '[RECRUITMENT_TEMPLATE_V1]');
    }
  }

  let questionsSlowmodeSec = Number(cfg.questionsSlowmodeSec || 60);
  if (questionsChannel && questionsChannel.type === ChannelType.GuildText) {
    questionsSlowmodeSec = Number(questionsChannel.rateLimitPerUser || 0);
  }

  const raw = loadRawConfig();
  raw.default = {
    ...(raw.default || {}),
    categoryName: category.name,
    channels: channelSnapshot,
    roles: roleSnapshot,
    pins: pinsSnapshot,
    questionsSlowmodeSec
  };

  saveRawConfig(raw);

  return {
    categoryId: category.id,
    categoryName: category.name,
    questionsSlowmodeSec,
    channels: channelSnapshot,
    roles: roleSnapshot
  };
}

async function enforceRecruitmentAnnouncementMessage(message) {
  if (!message.guild || message.author.bot) return;

  const state = loadState();
  const guildState = state.guilds && state.guilds[message.guild.id];
  if (!guildState || !guildState.announcementChannelId) return;
  if (message.channelId !== guildState.announcementChannelId) return;

  const member = message.member;
  if (!member) return;

  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild);
  if (isAdmin) return;

  const reasons = [];
  if (message.mentions.everyone) {
    reasons.push('Mentions @everyone/@here are not allowed in this channel.');
  }

  const pingRoleId = guildState.roleIds && guildState.roleIds.optInPing;
  const mentionedRoleIds = [...message.mentions.roles.keys()];

  const cfg = getGuildConfig(message.guild.id);
  const strictRoleOnly = cfg.strictMentionRoleOnly !== false;
  if (
    strictRoleOnly &&
    mentionedRoleIds.length > 0 &&
    mentionedRoleIds.some(roleId => roleId !== pingRoleId)
  ) {
    reasons.push('Only role "🔔 Набор открыт" may be mentioned in this channel.');
  }

  if (!reasons.length) return;

  try {
    await message.delete();
  } catch {
    return;
  }

  try {
    const warning = await message.channel.send(
      `${member}, message removed: ${reasons.join(' ')}`
    );
    setTimeout(() => {
      warning.delete().catch(() => {});
    }, 12000);
  } catch {
    // ignore warning send failures
  }
}

module.exports = {
  PACK_CHOICES,
  getGuildConfig,
  getRecruitmentMessageTemplates,
  getRecruitmentWorkflowPolicy,
  getRecruitmentStateForGuild,
  saveRecruitmentStateForGuild,
  saveRecruitmentWorkflowPolicy,
  saveRecruitmentMessageTemplates,
  saveDefaultSnapshotForGuild,
  setupRecruitmentArchitecture,
  setupRecruitmentForGuild,
  assignPackRole,
  assignPackRoleForGuild,
  enforceRecruitmentAnnouncementMessage
};
