require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ComponentType,
  SlashCommandBuilder
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

const config = require('../config.json');
const { baseEmbed } = require('./utils/embedFactory');
const { sendTelegram } = require('./utils/telegram');
const {
  PACK_CHOICES,
  getGuildConfig,
  getRecruitmentMessageTemplates,
  getRecruitmentWorkflowPolicy,
  getRecruitmentStateForGuild,
  saveRecruitmentStateForGuild,
  saveRecruitmentWorkflowPolicy,
  saveRecruitmentMessageTemplates,
  saveDefaultSnapshotForGuild,
  setupRecruitmentForGuild,
  assignPackRoleForGuild,
  enforceRecruitmentAnnouncementMessage
} = require('./utils/recruitmentArchitectureManager');

const branding = config.branding || {};
const BRAND_NAME = branding.name || 'VPROJECT';
const PROJECT_PHASE = branding.phase || 'OBT';
const BOT_ALERT_PREFIX = branding.alertPrefix || `${BRAND_NAME} bot`;
const BOT_PRESENCE = branding.presence || `${BRAND_NAME} • ${PROJECT_PHASE}`;
let CURRENT_BOT_PRESENCE = BOT_PRESENCE;
const PANEL_TITLE = branding.panelTitle || `${BRAND_NAME} Bot Panel`;
const PANEL_HEADER_TITLE =
  branding.panelHeaderTitle || `${BRAND_NAME} | GTA5RP RAGE:MP`;
const PANEL_HEADER_SUBTITLE =
  branding.panelHeaderSubtitle || `Bot Control Panel (${PROJECT_PHASE})`;
const PANEL_OVERVIEW_SUBTITLE =
  branding.panelOverviewSubtitle || `Simple control panel for ${BRAND_NAME} Discord bot.`;

const ROLE_REQUESTABLE_PACKS = ['leader_recruitment', 'deputy_recruitment', 'member_base'];
const ROLE_REQUEST_PACK_LABELS = {
  leader_recruitment: 'Лидер',
  deputy_recruitment: 'Заместитель',
  member_base: 'Участник'
};
const ROLE_REQUEST_PACK_ALIASES = {
  'leader_recruitment': 'leader_recruitment',
  'лидер': 'leader_recruitment',
  'leader': 'leader_recruitment',
  'deputy_recruitment': 'deputy_recruitment',
  'зам': 'deputy_recruitment',
  'deputy': 'deputy_recruitment',
  'member_base': 'member_base',
  'участник': 'member_base',
  'база': 'member_base',
  'member': 'member_base'
};
const ROLE_REQUESTS_FALLBACK_CHANNEL = '📝│запросы-ролей';
const ROLE_APPROVALS_FALLBACK_CHANNEL = '🔐│одобрение-ролей';
const WORKFLOW_REQUEST_AUDIENCE_ALL = 'all_members';

// ------------------------------------------------------
// Helpers: files & escaping
// ------------------------------------------------------

const EMBEDS_FILE = path.join(__dirname, '..', 'data', 'embeds.json');
const AUTOROLES_FILE = path.join(__dirname, '..', 'data', 'autoroles.json');
const MESSAGES_FILE = path.join(__dirname, '..', 'data', 'messages.json');
const ROLE_REQUESTS_FILE = path.join(__dirname, '..', 'data', 'recruitment-role-requests.json');
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

function loadConfigFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfigToDisk(nextConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(nextConfig, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save config.json:', err);
    return false;
  }
}

function ensureFile(filePath, fallback) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, fallback, 'utf8');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toSingleString(value, fallback = '') {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  if (value == null) return fallback;
  return String(value);
}

function renderTemplate(template, vars) {
  const text = String(template || '');
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    if (!vars || typeof vars !== 'object') return '';
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

const ROLE_REQUEST_PACK_DESCRIPTIONS_DEFAULT = {
  leader_recruitment: 'руководство подразделением набора',
  deputy_recruitment: 'помощник лидера набора',
  member_base: 'участник подразделения набора'
};

function getRoleRequestPackLabel(pack) {
  const guildId = process.env.GUILD_ID;
  if (guildId) {
    const state = getRecruitmentStateForGuild(guildId);
    if (state && state.roleRequestButtonLabels && state.roleRequestButtonLabels[pack]) {
      return state.roleRequestButtonLabels[pack];
    }
  }
  return ROLE_REQUEST_PACK_LABELS[pack] || pack || '—';
}

function getRoleRequestPackDescription(pack) {
  const guildId = process.env.GUILD_ID;
  if (guildId) {
    const state = getRecruitmentStateForGuild(guildId);
    if (state && state.roleRequestButtonDescriptions && state.roleRequestButtonDescriptions[pack]) {
      return state.roleRequestButtonDescriptions[pack];
    }
  }
  return ROLE_REQUEST_PACK_DESCRIPTIONS_DEFAULT[pack] || '';
}

function buildRoleRequestTemplateVars(entry, context, extra = {}) {
  const id = entry && entry.id ? String(entry.id) : '';
  const reason = entry && entry.reason ? String(entry.reason) : '';
  const decisionReason = entry && entry.decisionReason ? String(entry.decisionReason) : '';
  const statusPast = entry && entry.status === 'approved' ? 'ОДОБРЕН' : 'ОТКЛОНЕН';
  const statusPastLower = statusPast.toLowerCase();

  return {
    id,
    idShort: id ? id.slice(0, 8) : '',
    idSpoiler: id ? `||${id}||` : '',
    pack: entry && entry.pack ? String(entry.pack) : '',
    packLabel: getRoleRequestPackLabel(entry && entry.pack),
    reason: reason || '—',
    decisionReason: decisionReason || '',
    decisionReasonLine: decisionReason ? `\nПричина решения: ${decisionReason}` : '',
    requesterMention: entry && entry.requestedByUserId ? `<@${entry.requestedByUserId}>` : '',
    targetMention: entry && entry.targetUserId ? `<@${entry.targetUserId}>` : '',
    approverMention: entry && entry.decidedByUserId ? `<@${entry.decidedByUserId}>` : '',
    statusPast,
    statusPastLower,
    statusEmoji: entry && entry.status === 'approved' ? '✅' : '⛔',
    ...extra
  };
}

function normaliseStringArray(value) {
  if (Array.isArray(value)) return value.map(v => String(v));
  if (value == null || value === '') return [];
  return [String(value)];
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || '').trim());
}

function isInviteCode(value) {
  return /^[A-Za-z0-9_-]{2,32}$/.test(String(value || '').trim());
}

function secureEquals(a, b) {
  const aStr = String(a || '');
  const bStr = String(b || '');
  const aBuf = Buffer.from(aStr);
  const bBuf = Buffer.from(bStr);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function parseCookieHeader(rawCookie) {
  const out = {};
  const header = String(rawCookie || '');
  if (!header) return out;

  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

// Embeds storage
function loadEmbeds() {
  try {
    ensureFile(EMBEDS_FILE, '[]');
    return JSON.parse(fs.readFileSync(EMBEDS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveEmbeds(list) {
  try {
    ensureFile(EMBEDS_FILE, '[]');
    fs.writeFileSync(EMBEDS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save embeds.json:', err);
  }
}

// Auto-roles storage
function loadAutoRoles() {
  try {
    ensureFile(
      AUTOROLES_FILE,
      JSON.stringify(
        {
          enabled: false,
          botEnabled: false,
          autoRoles: [],
          botRoles: [],
          inviteRoles: []
        },
        null,
        2
      )
    );
    const parsed = JSON.parse(fs.readFileSync(AUTOROLES_FILE, 'utf8'));
    return {
      enabled: !!parsed.enabled,
      botEnabled: !!parsed.botEnabled,
      autoRoles: parsed.autoRoles || [],
      botRoles: parsed.botRoles || [],
      inviteRoles: parsed.inviteRoles || []
    };
  } catch {
    return {
      enabled: false,
      botEnabled: false,
      autoRoles: [],
      botRoles: [],
      inviteRoles: []
    };
  }
}

function saveAutoRoles(cfg) {
  try {
    ensureFile(
      AUTOROLES_FILE,
      JSON.stringify(
        {
          enabled: false,
          botEnabled: false,
          autoRoles: [],
          botRoles: [],
          inviteRoles: []
        },
        null,
        2
      )
    );
    fs.writeFileSync(AUTOROLES_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save autoroles.json:', err);
  }
}

// Message tracking storage
let messageCache = null;
let messageDirty = false;
let messageFlushTimer = null;
let messageFlushInFlight = false;

const MESSAGE_FLUSH_INTERVAL_MS = Number(
  process.env.MESSAGE_FLUSH_INTERVAL_MS || 10000
);

function loadMessagesFromDiskSync() {
  try {
    ensureFile(MESSAGES_FILE, '{}');
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function loadMessages() {
  if (!messageCache) messageCache = loadMessagesFromDiskSync();
  return messageCache;
}

async function flushMessagesToDisk() {
  if (!messageCache || !messageDirty) return;
  if (messageFlushInFlight) return;
  messageFlushInFlight = true;

  try {
    ensureFile(MESSAGES_FILE, '{}');
    const tmp = `${MESSAGES_FILE}.tmp`;
    await fs.promises.writeFile(
      tmp,
      JSON.stringify(messageCache, null, 2),
      'utf8'
    );
    await fs.promises.rename(tmp, MESSAGES_FILE);
    messageDirty = false;
  } catch (err) {
    console.error('Failed to flush messages.json:', err);
  } finally {
    messageFlushInFlight = false;
    if (messageDirty) scheduleMessagesFlush();
  }
}

function scheduleMessagesFlush() {
  messageDirty = true;
  if (messageFlushTimer) return;
  messageFlushTimer = setTimeout(async () => {
    messageFlushTimer = null;
    await flushMessagesToDisk();
  }, Math.max(1000, MESSAGE_FLUSH_INTERVAL_MS));
}

function saveMessages() {
  // Kept for compatibility with existing call sites.
  scheduleMessagesFlush();
}

function loadRoleRequests() {
  try {
    ensureFile(ROLE_REQUESTS_FILE, '{"guilds":{}}');
    const parsed = JSON.parse(fs.readFileSync(ROLE_REQUESTS_FILE, 'utf8'));
    return {
      guilds: parsed && typeof parsed === 'object' && parsed.guilds ? parsed.guilds : {}
    };
  } catch {
    return { guilds: {} };
  }
}

function saveRoleRequests(payload) {
  try {
    ensureFile(ROLE_REQUESTS_FILE, '{"guilds":{}}');
    fs.writeFileSync(ROLE_REQUESTS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save recruitment role requests:', err);
  }
}

function resolveRoleRequestPack(rawValue) {
  const normalized = String(rawValue || '').trim().toLowerCase();
  return ROLE_REQUEST_PACK_ALIASES[normalized] || '';
}

function looksLikeRoleRequestId(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  // Accept UUIDs and our fallback `${Date.now()}-${hex}` ids.
  return /^[a-z0-9-]{8,}$/i.test(v);
}

function extractRoleRequestIdFromText(text) {
  const raw = String(text || '');
  // Preferred format used by this bot in approvals channel: [ROLE_REQUEST:<id>]
  const bracketMatch = raw.match(/\[ROLE_REQUEST:([^\]]+)]/i);
  if (bracketMatch && looksLikeRoleRequestId(bracketMatch[1])) return bracketMatch[1];

  const looseMatch = raw.match(/ROLE_REQUEST:([a-z0-9-]{8,})/i);
  if (looseMatch && looksLikeRoleRequestId(looseMatch[1])) return looseMatch[1];

  return '';
}

function memberHasAnyRole(member, roleIds) {
  return roleIds.filter(Boolean).some(roleId => member.roles.cache.has(roleId));
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

function getRoleRequestsForGuild(guildId) {
  const payload = loadRoleRequests();
  payload.guilds[guildId] = payload.guilds[guildId] || [];
  return { payload, list: payload.guilds[guildId] };
}

async function resolveRecruitmentWorkflowContext(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();

  const cfg = getGuildConfig(guild.id);
  const workflow = getRecruitmentWorkflowPolicy(guild.id);
  const state = getRecruitmentStateForGuild(guild.id) || {};

  const roleByName = name => guild.roles.cache.find(r => r.name === name) || null;
  const roleById = id => (id ? guild.roles.cache.get(id) || null : null);
  const roles = {
    adminFull: roleByName(cfg.roles && cfg.roles.adminFull),
    adminMod: roleByName(cfg.roles && cfg.roles.adminMod),
    leaderRecruitment: roleByName(cfg.roles && cfg.roles.leaderRecruitment),
    deputyRecruitment: roleByName(cfg.roles && cfg.roles.deputyRecruitment),
    memberBase: roleByName(cfg.roles && cfg.roles.memberBase)
  };

  const workflowApproverRolesByName = (workflow.approverRoleNames || [])
    .map(roleName => findRoleByConfiguredName(guild, roleName))
    .filter(Boolean);
  const workflowApproverRolesById = (workflow.approverRoleIds || [])
    .map(roleId => roleById(roleId))
    .filter(Boolean);

  const roleRequestsChannelName = (cfg.channels && cfg.channels.roleRequests) || ROLE_REQUESTS_FALLBACK_CHANNEL;
  const approvalsChannelName = (cfg.channels && cfg.channels.approvals) || ROLE_APPROVALS_FALLBACK_CHANNEL;

  const roleRequestsChannel =
    (state.roleRequestsChannelId && guild.channels.cache.get(state.roleRequestsChannelId)) ||
    guild.channels.cache.find(ch => ch.type === ChannelType.GuildText && ch.name === roleRequestsChannelName) ||
    null;
  const approvalsChannel =
    (state.approvalsChannelId && guild.channels.cache.get(state.approvalsChannelId)) ||
    guild.channels.cache.find(ch => ch.type === ChannelType.GuildText && ch.name === approvalsChannelName) ||
    null;

  return {
    cfg,
    workflow,
    state,
    roles,
    workflowApproverRolesByName,
    workflowApproverRolesById,
    roleRequestsChannel,
    approvalsChannel,
    roleRequestsChannelName,
    approvalsChannelName
  };
}

function getWorkflowApproverRoleIds(context) {
  return [...new Set([
    context.roles.adminFull && context.roles.adminFull.id,
    context.roles.adminMod && context.roles.adminMod.id,
    ...(context.workflowApproverRolesByName || []).map(role => role.id),
    ...(context.workflowApproverRolesById || []).map(role => role.id),
    ...(((context.state && context.state.roleIds && context.state.roleIds.workflowApprovers) || []).map(String))
  ].filter(Boolean))];
}

async function createRecruitmentRoleRequest(guild, requestedByUserId, targetUserId, pack, reason, sourceTag = 'discord') {
  const context = await resolveRecruitmentWorkflowContext(guild);
  const requester = await guild.members.fetch(requestedByUserId);

  const canRequest = context.workflow.requestAudience === WORKFLOW_REQUEST_AUDIENCE_ALL
    ? true
    : memberHasAnyRole(requester, [
      context.roles.leaderRecruitment && context.roles.leaderRecruitment.id,
      context.roles.deputyRecruitment && context.roles.deputyRecruitment.id,
      context.roles.adminFull && context.roles.adminFull.id,
      context.roles.adminMod && context.roles.adminMod.id,
      context.roles.memberBase && context.roles.memberBase.id
    ]);
  if (!canRequest) {
    throw new Error('Только лидер/зам/админ может создавать запрос на роль.');
  }

  if (!ROLE_REQUESTABLE_PACKS.includes(pack)) {
    throw new Error('Недопустимый пакет роли для запроса.');
  }

  // Duplicate prevention: check for existing pending request with same target + pack
  const { payload, list } = getRoleRequestsForGuild(guild.id);
  const duplicate = list.find(
    r => r.status === 'pending' && r.targetUserId === targetUserId && r.pack === pack
  );
  if (duplicate) {
    throw new Error(`Уже существует активный запрос на роль "${getRoleRequestPackLabel(pack)}" для этого пользователя (ID: ${duplicate.id.slice(0, 8)}…).`);
  }

  const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const entry = {
    id: requestId,
    requestedByUserId,
    targetUserId,
    pack,
    reason: reason || '',
    source: sourceTag,
    status: 'pending',
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedByUserId: null,
    decisionReason: '',
    approvalMessageId: null
  };

  list.push(entry);
  saveRoleRequests(payload);

  // Send rich embed with Approve/Deny buttons to the approvals channel
  if (context.approvalsChannel) {
    const approvalEmbed = new EmbedBuilder()
      .setTitle('📋 Новый запрос на роль')
      .setColor(config.brandColor || 0x2b2d31)
      .addFields(
        { name: '👤 Запрашивающий', value: `<@${entry.requestedByUserId}>`, inline: true },
        { name: '🎯 Целевой пользователь', value: `<@${entry.targetUserId}>`, inline: true },
        { name: '🛡️ Роль', value: getRoleRequestPackLabel(entry.pack), inline: true },
        { name: '📝 Причина', value: entry.reason || '—', inline: false },
        { name: '🔖 ID запроса', value: `\`${entry.id.slice(0, 8)}…\``, inline: true },
        { name: '📅 Дата', value: `<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:f>`, inline: true }
      )
      .setFooter({ text: `ID: ${entry.id}` })
      .setTimestamp();

    const approveBtn = new ButtonBuilder()
      .setCustomId(`approve_role_request_${entry.id}`)
      .setLabel('✅ Одобрить')
      .setStyle(ButtonStyle.Success);

    const denyBtn = new ButtonBuilder()
      .setCustomId(`deny_role_request_${entry.id}`)
      .setLabel('❌ Отклонить')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn);

    const approvalMsg = await context.approvalsChannel.send({ embeds: [approvalEmbed], components: [row] });

    // Store approval message ID for later editing
    entry.approvalMessageId = approvalMsg.id;
    saveRoleRequests(payload);
  }

  // Send audit log
  await sendAuditLog(guild, '📋 Создан запрос на роль', [
    { name: 'Запрашивающий', value: `<@${entry.requestedByUserId}>`, inline: true },
    { name: 'Целевой', value: `<@${entry.targetUserId}>`, inline: true },
    { name: 'Роль', value: getRoleRequestPackLabel(entry.pack), inline: true },
    { name: 'Причина', value: entry.reason || '—', inline: false },
    { name: 'ID', value: `\`${entry.id}\``, inline: false }
  ], 0x3498db);

  return { entry, context };
}

async function decideRecruitmentRoleRequest(guild, requestId, action, approverUserId, decisionReason = '') {
  const context = await resolveRecruitmentWorkflowContext(guild);
  const approver = await guild.members.fetch(approverUserId);
  const canDecide = memberHasAnyRole(approver, getWorkflowApproverRoleIds(context));
  if (!canDecide) {
    throw new Error('Решение может принимать только одобряющая роль (админ/модератор).');
  }

  const { payload, list } = getRoleRequestsForGuild(guild.id);
  const entry = list.find(item => item.id === requestId);
  if (!entry) {
    throw new Error('Запрос не найден.');
  }
  if (entry.status !== 'pending') {
    throw new Error(`Запрос уже обработан (${entry.status}).`);
  }

  if (action === 'approve') {
    const roleKey = PACK_CHOICES[entry.pack];
    const roleName = roleKey ? context.cfg.roles[roleKey] : '';
    const role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      throw new Error(`Роль для пакета ${entry.pack} не найдена.`);
    }

    const targetMember = await guild.members.fetch(entry.targetUserId);
    await targetMember.roles.add(role, `Роль выдана по запросу ${entry.id} (одобрил ${approver.user.tag})`);
  }

  entry.status = action === 'approve' ? 'approved' : 'rejected';
  entry.decidedAt = new Date().toISOString();
  entry.decidedByUserId = approverUserId;
  entry.decisionReason = String(decisionReason || '').trim();
  saveRoleRequests(payload);

  // Edit the original approval embed in-place (change color, add footer, disable buttons)
  if (context.approvalsChannel && entry.approvalMessageId) {
    try {
      const approvalMsg = await context.approvalsChannel.messages.fetch(entry.approvalMessageId);
      if (approvalMsg) {
        const isApproved = entry.status === 'approved';
        const updatedEmbed = EmbedBuilder.from(approvalMsg.embeds[0])
          .setColor(isApproved ? 0x2ecc71 : 0xe74c3c)
          .setFooter({
            text: `${isApproved ? '✅ Одобрено' : '❌ Отклонено'} — ${approver.user.tag}${entry.decisionReason ? ` | Причина: ${entry.decisionReason}` : ''} | ID: ${entry.id}`
          })
          .setTimestamp(new Date(entry.decidedAt));

        // Disable all buttons
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_role_request_${entry.id}`)
            .setLabel('✅ Одобрить')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`deny_role_request_${entry.id}`)
            .setLabel('❌ Отклонить')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

        await approvalMsg.edit({ embeds: [updatedEmbed], components: [disabledRow] });
      }
    } catch (err) {
      console.error('Failed to edit approval message:', err);
    }
  }

  // Post decision notification in requests channel
  if (context.roleRequestsChannel) {
    const isApproved = entry.status === 'approved';
    const decisionEmbed = new EmbedBuilder()
      .setTitle(`${isApproved ? '✅' : '❌'} Запрос ${isApproved ? 'одобрен' : 'отклонён'}`)
      .setColor(isApproved ? 0x2ecc71 : 0xe74c3c)
      .addFields(
        { name: 'Пользователь', value: `<@${entry.targetUserId}>`, inline: true },
        { name: 'Роль', value: getRoleRequestPackLabel(entry.pack), inline: true },
        { name: 'Решение принял', value: `<@${approverUserId}>`, inline: true }
      )
      .setTimestamp();

    if (entry.decisionReason) {
      decisionEmbed.addFields({ name: 'Причина', value: entry.decisionReason, inline: false });
    }

    await context.roleRequestsChannel.send({ embeds: [decisionEmbed] });
  }

  // Send audit log
  const isApproved = entry.status === 'approved';
  await sendAuditLog(guild, `${isApproved ? '✅' : '❌'} Запрос ${isApproved ? 'одобрен' : 'отклонён'}`, [
    { name: 'Целевой', value: `<@${entry.targetUserId}>`, inline: true },
    { name: 'Роль', value: getRoleRequestPackLabel(entry.pack), inline: true },
    { name: 'Решение', value: `<@${approverUserId}>`, inline: true },
    { name: 'Причина', value: entry.decisionReason || '—', inline: false },
    { name: 'ID', value: `\`${entry.id}\``, inline: false }
  ], isApproved ? 0x2ecc71 : 0xe74c3c);

  return entry;
}

async function handleRecruitmentRoleRequestMessage(message) {
  if (!message.guild || message.author.bot) return false;

  const content = String(message.content || '').trim();
  const hasPrefix = content.startsWith('!') || content.startsWith(':');
  if (!hasPrefix) return false;

  const commandText = content.slice(1).trim();

  const context = await resolveRecruitmentWorkflowContext(message.guild);
  const requestChannelId = context.roleRequestsChannel && context.roleRequestsChannel.id;
  const approvalsChannelId = context.approvalsChannel && context.approvalsChannel.id;

  if (!requestChannelId && !approvalsChannelId) return false;

  if (message.channelId === requestChannelId) {
    if (!commandText.toLowerCase().startsWith('роль ')) return false;

    const parts = commandText.split(/\s+/).filter(Boolean);
    const pack = resolveRoleRequestPack(parts[1]);
    const mentionedMember = message.mentions.members && message.mentions.members.first();
    if (!pack || !mentionedMember) {
      await message.reply('Формат: `!роль <лидер|зам|участник> @пользователь <причина>` (также поддерживается `:роль`)');
      return true;
    }

    const mentionToken = parts.find(p => p.includes(mentionedMember.id)) || '';
    const mentionIndex = parts.indexOf(mentionToken);
    const reason = mentionIndex >= 0 ? parts.slice(mentionIndex + 1).join(' ').trim() : '';

    try {
      const result = await createRecruitmentRoleRequest(
        message.guild,
        message.author.id,
        mentionedMember.id,
        pack,
        reason,
        'discord-channel'
      );

      const templates = getRecruitmentMessageTemplates(message.guild.id);
      const vars = buildRoleRequestTemplateVars(result.entry, result.context);
      const replyText = renderTemplate(templates.requesterCreatedReply, vars).trim();
      await message.reply(`⚠️ Текстовые команды устарели. Используйте кнопки в канале запросов.\n\n${replyText || 'Запрос создан.'}`);
    } catch (err) {
      await message.reply(err.message || 'Не удалось создать запрос.');
    }

    return true;
  }

  if (message.channelId === approvalsChannelId) {
    const lower = commandText.toLowerCase();
    const isApprove = lower === 'одобрить' || lower.startsWith('одобрить ');
    const isReject = lower === 'отклонить' || lower.startsWith('отклонить ');
    if (!isApprove && !isReject) return false;

    const parts = commandText.split(/\s+/).filter(Boolean);
    const explicitId = looksLikeRoleRequestId(parts[1]) ? String(parts[1]).trim() : '';
    let requestId = explicitId;

    // Allow approvals by replying to the bot message containing [ROLE_REQUEST:<id>]
    if (!requestId && message.reference && message.reference.messageId) {
      try {
        const referenced = await message.fetchReference();
        requestId = extractRoleRequestIdFromText(referenced && referenced.content);
      } catch {
        // Ignore failures to fetch the referenced message.
      }
    }

    if (!requestId) {
      await message.reply(
        'Формат: `!одобрить <ID>` или `!отклонить <ID> <причина>` (также `:одобрить`/`:отклонить`).\n' +
        'Либо ответьте (reply) на сообщение бота вида `[ROLE_REQUEST:ID] ...` и напишите `!одобрить` или `!отклонить причина`.'
      );
      return true;
    }

    const decisionReason = (explicitId ? parts.slice(2) : parts.slice(1)).join(' ').trim();

    try {
      await decideRecruitmentRoleRequest(
        message.guild,
        requestId,
        isApprove ? 'approve' : 'reject',
        message.author.id,
        decisionReason
      );
      await message.reply(`⚠️ Текстовые команды устарели. Используйте кнопки одобрения на запросе.\n\nЗапрос ${requestId} ${isApprove ? 'одобрен' : 'отклонен'}.`);
    } catch (err) {
      await message.reply(err.message || 'Не удалось обработать запрос.');
    }

    return true;
  }

  return false;
}

// ------------------------------------------------------
// Audit log helper
// ------------------------------------------------------

async function sendAuditLog(guild, title, fields, color = 0x3498db) {
  try {
    const archConfig = getGuildConfig(guild.id);
    const logChannelId = archConfig.logChannelId || (config.logs && config.logs.channelId);
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setTimestamp();
    if (fields && fields.length) embed.addFields(fields);
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[AuditLog] Failed to send audit log:', err.message);
  }
}

// ------------------------------------------------------
// Role Request Panel (persistent embed with buttons)
// ------------------------------------------------------

const ROLE_REQUEST_PANEL_PACK_EMOJIS = {
  leader_recruitment: '',
  deputy_recruitment: '',
  member_base: ''
};

function buildRoleRequestPanelEmbed() {
  const roleLines = ROLE_REQUESTABLE_PACKS.map(pack => {
    const label = getRoleRequestPackLabel(pack);
    const desc = getRoleRequestPackDescription(pack);
    return desc ? `**${label}** — ${desc}` : `**${label}**`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('Запросы на роли')
    .setDescription(
      'Для получения роли в разделе набора нажмите на одну из кнопок ниже.\n\n' +
      '**Доступные роли:**\n\n' +
      roleLines + '\n\n' +
      'После нажатия откроется форма: укажите пользователя и причину запроса.\n' +
      'Минимальная длина причины — 10 символов.\n\n' +
      'Статус запроса будет отображён в этом канале после рассмотрения.'
    )
    .setColor(config.brandColor || 0x2b2d31)
    .setFooter({ text: `${BRAND_NAME} · Система запросов ролей` });
  return embed;
}

function buildRoleRequestPanelButtons() {
  const buttons = ROLE_REQUESTABLE_PACKS.map(pack => {
    const label = getRoleRequestPackLabel(pack);
    return new ButtonBuilder()
      .setCustomId(`role_request_panel_${pack}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);
  });
  return new ActionRowBuilder().addComponents(buttons);
}

async function sendRoleRequestPanel(channel) {
  const embed = buildRoleRequestPanelEmbed();
  const row = buildRoleRequestPanelButtons();
  const msg = await channel.send({ embeds: [embed], components: [row] });
  return msg;
}

async function ensureRoleRequestPanel(guild) {
  const context = await resolveRecruitmentWorkflowContext(guild);
  if (!context.roleRequestsChannel) return null;

  const state = getRecruitmentStateForGuild(guild.id) || {};
  const existingMsgId = state.roleRequestPanelMessageId;

  // Check if the panel message still exists
  if (existingMsgId) {
    try {
      const existing = await context.roleRequestsChannel.messages.fetch(existingMsgId);
      if (existing) return existing; // panel exists, nothing to do
    } catch {
      // message was deleted or not found — re-send
    }
  }

  // Send a new panel
  const msg = await sendRoleRequestPanel(context.roleRequestsChannel);
  saveRecruitmentStateForGuild(guild.id, { roleRequestPanelMessageId: msg.id });
  console.log(`[RoleRequests] Panel sent in #${context.roleRequestsChannel.name} (${msg.id})`);
  return msg;
}

// Lock down #запросы-ролей so only the bot can send messages
async function lockdownRoleRequestsChannel(guild) {
  const context = await resolveRecruitmentWorkflowContext(guild);
  const channel = context.roleRequestsChannel;
  if (!channel) return;

  const { PermissionFlagsBits } = require('discord.js');
  const botMember = guild.members.me;
  const everyone = guild.roles.everyone;

  try {
    // Deny SendMessages for @everyone
    await channel.permissionOverwrites.edit(everyone, {
      ViewChannel: true,
      SendMessages: false,
      AddReactions: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      ReadMessageHistory: true
    }, { reason: 'Role requests: button-only mode — no user messages' });

    // Allow SendMessages for the bot itself
    await channel.permissionOverwrites.edit(botMember, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      ReadMessageHistory: true
    }, { reason: 'Role requests: bot needs to post panel & notifications' });

    // Deny SendMessages for staff roles too (they use buttons in approvals channel)
    const staffRoles = [
      context.roles.adminFull,
      context.roles.adminMod,
      context.roles.leaderRecruitment,
      context.roles.deputyRecruitment
    ].filter(Boolean);

    for (const role of staffRoles) {
      await channel.permissionOverwrites.edit(role, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true
      }, { reason: 'Role requests: button-only mode — no user messages' });
    }

    console.log(`[RoleRequests] Channel #${channel.name} locked down — bot-only send permission.`);
  } catch (err) {
    console.error('[RoleRequests] Failed to lock down channel:', err.message);
  }
}

// ------------------------------------------------------
// Button & Modal Interaction Handlers
// ------------------------------------------------------

async function handleRoleRequestPanelButton(interaction) {
  // customId format: role_request_panel_<pack>
  const pack = interaction.customId.replace('role_request_panel_', '');
  if (!ROLE_REQUESTABLE_PACKS.includes(pack)) {
    return interaction.reply({ content: '❌ Неизвестный тип роли.', ephemeral: true });
  }

  const label = getRoleRequestPackLabel(pack);

  const modal = new ModalBuilder()
    .setCustomId(`role_request_modal_${pack}`)
    .setTitle(`Запрос роли: ${label}`);

  const targetInput = new TextInputBuilder()
    .setCustomId('target_user')
    .setLabel('ID или @упоминание пользователя')
    .setPlaceholder('Например: 123456789012345678 или @Имя')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(50);

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Причина запроса (мин. 10 символов)')
    .setPlaceholder('Укажите, почему этот пользователь должен получить роль...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(targetInput),
    new ActionRowBuilder().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

async function handleRoleRequestModalSubmit(interaction) {
  // customId format: role_request_modal_<pack>
  const pack = interaction.customId.replace('role_request_modal_', '');
  if (!ROLE_REQUESTABLE_PACKS.includes(pack)) {
    return interaction.reply({ content: '❌ Неизвестный тип роли.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const rawTarget = interaction.fields.getTextInputValue('target_user').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();

  // Parse target user ID from mention format <@ID> or <@!ID> or raw snowflake
  let targetUserId = rawTarget.replace(/[<@!>]/g, '').trim();

  // Validate it's a snowflake
  if (!/^\d{17,20}$/.test(targetUserId)) {
    return interaction.editReply({ content: '❌ Неверный формат пользователя. Укажите ID (число) или @упоминание.' });
  }

  // Verify user exists in the guild
  let targetMember;
  try {
    targetMember = await interaction.guild.members.fetch(targetUserId);
  } catch {
    return interaction.editReply({ content: '❌ Пользователь не найден на сервере.' });
  }

  try {
    const result = await createRecruitmentRoleRequest(
      interaction.guild,
      interaction.user.id,
      targetUserId,
      pack,
      reason,
      'discord-button'
    );

    await interaction.editReply({
      content: `✅ Запрос создан!\n\n**Роль:** ${getRoleRequestPackLabel(pack)}\n**Пользователь:** <@${targetUserId}>\n**ID запроса:** \`${result.entry.id.slice(0, 8)}…\`\n\nОжидайте решение администратора.`
    });
  } catch (err) {
    await interaction.editReply({ content: `❌ ${err.message}` });
  }
}

async function handleApproveButton(interaction) {
  // customId format: approve_role_request_<requestId>
  const requestId = interaction.customId.replace('approve_role_request_', '');

  await interaction.deferReply({ ephemeral: true });

  try {
    const entry = await decideRecruitmentRoleRequest(
      interaction.guild,
      requestId,
      'approve',
      interaction.user.id,
      ''
    );
    await interaction.editReply({
      content: `✅ Запрос одобрен. Роль **${getRoleRequestPackLabel(entry.pack)}** выдана пользователю <@${entry.targetUserId}>.`
    });
  } catch (err) {
    await interaction.editReply({ content: `❌ ${err.message}` });
  }
}

async function handleDenyButton(interaction) {
  // customId format: deny_role_request_<requestId>
  const requestId = interaction.customId.replace('deny_role_request_', '');

  // Verify the request still exists and is pending before showing modal
  const { list } = getRoleRequestsForGuild(interaction.guild.id);
  const entry = list.find(r => r.id === requestId);
  if (!entry || entry.status !== 'pending') {
    return interaction.reply({ content: '❌ Запрос уже обработан или не найден.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`deny_reason_modal_${requestId}`)
    .setTitle('Отклонение запроса');

  const reasonInput = new TextInputBuilder()
    .setCustomId('deny_reason')
    .setLabel('Причина отклонения (необязательно)')
    .setPlaceholder('Укажите причину отклонения...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

  await interaction.showModal(modal);
}

async function handleDenyReasonModalSubmit(interaction) {
  // customId format: deny_reason_modal_<requestId>
  const requestId = interaction.customId.replace('deny_reason_modal_', '');
  const reason = (interaction.fields.getTextInputValue('deny_reason') || '').trim();

  await interaction.deferReply({ ephemeral: true });

  try {
    const entry = await decideRecruitmentRoleRequest(
      interaction.guild,
      requestId,
      'reject',
      interaction.user.id,
      reason
    );
    await interaction.editReply({
      content: `❌ Запрос отклонён для <@${entry.targetUserId}> (${getRoleRequestPackLabel(entry.pack)}).${reason ? `\nПричина: ${reason}` : ''}`
    });
  } catch (err) {
    await interaction.editReply({ content: `❌ ${err.message}` });
  }
}

// ------------------------------------------------------
// /pending_requests slash command handler
// ------------------------------------------------------

async function handlePendingRequestsCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const context = await resolveRecruitmentWorkflowContext(interaction.guild);
  const canView = memberHasAnyRole(interaction.member, getWorkflowApproverRoleIds(context));
  if (!canView) {
    return interaction.editReply({ content: '❌ У вас нет прав для просмотра запросов.' });
  }

  const statusFilter = interaction.options.getString('статус') || 'pending';
  const { list } = getRoleRequestsForGuild(interaction.guild.id);

  let filtered;
  if (statusFilter === 'all') {
    filtered = [...list].reverse();
  } else {
    filtered = list.filter(r => r.status === statusFilter).reverse();
  }

  if (!filtered.length) {
    const statusLabels = { pending: 'ожидающих', approved: 'одобренных', rejected: 'отклонённых', expired: 'истёкших', all: '' };
    return interaction.editReply({
      content: `📭 Нет ${statusLabels[statusFilter] || ''} запросов.`
    });
  }

  const PAGE_SIZE = 10;
  const page = 0;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const statusEmojis = { pending: '⏳', approved: '✅', rejected: '❌', expired: '⏰' };
  const statusLabels = { pending: 'Ожидает', approved: 'Одобрен', rejected: 'Отклонён', expired: 'Истёк' };

  const description = pageItems.map((r, i) => {
    const idx = page * PAGE_SIZE + i + 1;
    const emoji = statusEmojis[r.status] || '❓';
    const label = statusLabels[r.status] || r.status;
    const date = r.createdAt ? `<t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:R>` : '—';
    return `**${idx}.** ${emoji} \`${r.id.slice(0, 8)}…\` — **${getRoleRequestPackLabel(r.pack)}** для <@${r.targetUserId}>\n   ↳ ${label} | ${date} | Автор: <@${r.requestedByUserId}>`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle(`📋 Запросы на роли (${filtered.length} шт.)`)
    .setDescription(description)
    .setColor(config.brandColor || 0x2b2d31)
    .setFooter({ text: `Страница ${page + 1}/${totalPages} • Фильтр: ${statusFilter}` })
    .setTimestamp();

  const components = [];
  if (totalPages > 1) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`req_page_${statusFilter}_0`)
        .setLabel('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`req_page_${statusFilter}_1`)
        .setLabel('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(totalPages <= 1)
    );
    components.push(navRow);
  }

  await interaction.editReply({ embeds: [embed], components });
}

async function handleRequestPageButton(interaction) {
  // customId format: req_page_<statusFilter>_<pageNumber>
  const parts = interaction.customId.split('_');
  const statusFilter = parts[2];
  const page = parseInt(parts[3], 10);

  const { list } = getRoleRequestsForGuild(interaction.guild.id);
  let filtered;
  if (statusFilter === 'all') {
    filtered = [...list].reverse();
  } else {
    filtered = list.filter(r => r.status === statusFilter).reverse();
  }

  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const statusEmojis = { pending: '⏳', approved: '✅', rejected: '❌', expired: '⏰' };
  const statusLabels = { pending: 'Ожидает', approved: 'Одобрен', rejected: 'Отклонён', expired: 'Истёк' };

  const description = pageItems.map((r, i) => {
    const idx = page * PAGE_SIZE + i + 1;
    const emoji = statusEmojis[r.status] || '❓';
    const label = statusLabels[r.status] || r.status;
    const date = r.createdAt ? `<t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:R>` : '—';
    return `**${idx}.** ${emoji} \`${r.id.slice(0, 8)}…\` — **${getRoleRequestPackLabel(r.pack)}** для <@${r.targetUserId}>\n   ↳ ${label} | ${date} | Автор: <@${r.requestedByUserId}>`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle(`📋 Запросы на роли (${filtered.length} шт.)`)
    .setDescription(description || 'Нет запросов.')
    .setColor(config.brandColor || 0x2b2d31)
    .setFooter({ text: `Страница ${page + 1}/${totalPages} • Фильтр: ${statusFilter}` })
    .setTimestamp();

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`req_page_${statusFilter}_${page - 1}`)
      .setLabel('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`req_page_${statusFilter}_${page + 1}`)
      .setLabel('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );

  await interaction.update({ embeds: [embed], components: [navRow] });
}

// ------------------------------------------------------
// Request auto-expiry system
// ------------------------------------------------------

const REQUEST_EXPIRY_DAYS = 7;
const EXPIRY_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function expireStaleRoleRequests() {
  const payload = loadRoleRequests();
  const now = Date.now();
  let changed = false;

  for (const guildId of Object.keys(payload.guilds || {})) {
    const list = payload.guilds[guildId];
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      if (entry.status !== 'pending') continue;

      const createdAt = new Date(entry.createdAt).getTime();
      if (isNaN(createdAt)) continue;

      const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
      if (ageDays < REQUEST_EXPIRY_DAYS) continue;

      entry.status = 'expired';
      entry.decidedAt = new Date().toISOString();
      entry.decisionReason = `Автоматически истёк (${REQUEST_EXPIRY_DAYS} дней)`;
      changed = true;

      // Try to update the approval message in Discord
      try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const context = await resolveRecruitmentWorkflowContext(guild);

        // Edit approval message if it exists
        if (context.approvalsChannel && entry.approvalMessageId) {
          try {
            const approvalMsg = await context.approvalsChannel.messages.fetch(entry.approvalMessageId);
            if (approvalMsg) {
              const updatedEmbed = EmbedBuilder.from(approvalMsg.embeds[0])
                .setColor(0x95a5a6)
                .setFooter({ text: `⏰ Истёк срок (${REQUEST_EXPIRY_DAYS} дн.) | ID: ${entry.id}` })
                .setTimestamp(new Date(entry.decidedAt));

              const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`approve_role_request_${entry.id}`)
                  .setLabel('✅ Одобрить')
                  .setStyle(ButtonStyle.Success)
                  .setDisabled(true),
                new ButtonBuilder()
                  .setCustomId(`deny_role_request_${entry.id}`)
                  .setLabel('❌ Отклонить')
                  .setStyle(ButtonStyle.Danger)
                  .setDisabled(true)
              );

              await approvalMsg.edit({ embeds: [updatedEmbed], components: [disabledRow] });
            }
          } catch (err) {
            console.error(`[Expiry] Failed to edit approval message for ${entry.id}:`, err.message);
          }
        }

        // Notify in requests channel
        if (context.roleRequestsChannel) {
          const expiryEmbed = new EmbedBuilder()
            .setTitle('⏰ Запрос истёк')
            .setDescription(`Запрос на роль **${getRoleRequestPackLabel(entry.pack)}** для <@${entry.targetUserId}> истёк (${REQUEST_EXPIRY_DAYS} дней без решения).`)
            .setColor(0x95a5a6)
            .addFields({ name: 'Автор запроса', value: `<@${entry.requestedByUserId}>`, inline: true })
            .setTimestamp();
          await context.roleRequestsChannel.send({ embeds: [expiryEmbed] });
        }

        await sendAuditLog(guild, '⏰ Запрос истёк (авто)', [
          { name: 'Целевой', value: `<@${entry.targetUserId}>`, inline: true },
          { name: 'Роль', value: getRoleRequestPackLabel(entry.pack), inline: true },
          { name: 'Автор', value: `<@${entry.requestedByUserId}>`, inline: true },
          { name: 'ID', value: `\`${entry.id}\``, inline: false }
        ], 0x95a5a6);
      } catch (err) {
        console.error(`[Expiry] Error processing expired request ${entry.id}:`, err.message);
      }
    }
  }

  if (changed) {
    saveRoleRequests(payload);
    console.log('[Expiry] Stale role requests expired.');
  }
}

// ------------------------------------------------------
// Master InteractionCreate dispatcher
// ------------------------------------------------------

async function handleInteractionCreate(interaction) {
  // Button interactions
  if (interaction.isButton()) {
    const cid = interaction.customId;

    // Role request panel buttons
    if (cid.startsWith('role_request_panel_')) {
      return handleRoleRequestPanelButton(interaction);
    }

    // Approve button
    if (cid.startsWith('approve_role_request_')) {
      return handleApproveButton(interaction);
    }

    // Deny button
    if (cid.startsWith('deny_role_request_')) {
      return handleDenyButton(interaction);
    }

    // Pagination buttons for /pending_requests
    if (cid.startsWith('req_page_')) {
      return handleRequestPageButton(interaction);
    }
  }

  // Modal submissions
  if (interaction.isModalSubmit()) {
    const cid = interaction.customId;

    if (cid.startsWith('role_request_modal_')) {
      return handleRoleRequestModalSubmit(interaction);
    }

    if (cid.startsWith('deny_reason_modal_')) {
      return handleDenyReasonModalSubmit(interaction);
    }
  }

  // Slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'pending_requests') {
      return handlePendingRequestsCommand(interaction);
    }
  }
}

const warnState = new Map();
async function warnThrottled(key, text, minIntervalMs) {
  const now = Date.now();
  const last = warnState.get(key) || 0;
  if (now - last < minIntervalMs) return false;
  warnState.set(key, now);
  try {
    return await sendTelegram(text);
  } catch {
    return false;
  }
}

// ------------------------------------------------------
// Discord client & commands
// ------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Runtime safety: log + alert on unexpected failures.
process.on('unhandledRejection', err => {
  console.error('Unhandled promise rejection:', err);
  warnThrottled(
    'unhandledRejection',
    `${BOT_ALERT_PREFIX}: UnhandledRejection\n${String(err?.stack || err)}`,
    10 * 60 * 1000
  );
});

process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
  warnThrottled(
    'uncaughtException',
    `${BOT_ALERT_PREFIX}: UncaughtException\n${String(err?.stack || err)}`,
    10 * 60 * 1000
  );
});

// Discord disconnect loop detection (helps avoid repeated identify attempts).
const disconnectTimes = [];
const DISCONNECT_WINDOW_MS = Number(process.env.DISCONNECT_WINDOW_MS || 10 * 60 * 1000);
const DISCONNECT_WARN_THRESHOLD = Number(process.env.DISCONNECT_WARN_THRESHOLD || 3);

function recordDisconnect(reason) {
  const now = Date.now();
  disconnectTimes.push(now);
  while (disconnectTimes.length && now - disconnectTimes[0] > DISCONNECT_WINDOW_MS) disconnectTimes.shift();

  if (disconnectTimes.length >= DISCONNECT_WARN_THRESHOLD) {
    warnThrottled(
      'discordDisconnectLoop',
      `${BOT_ALERT_PREFIX}: Discord disconnect loop detected (${disconnectTimes.length} in last ${Math.round(DISCONNECT_WINDOW_MS / 60000)}m). Reason: ${reason}`,
      10 * 60 * 1000
    );
  }
}

client.on('shardDisconnect', (event, shardId) => {
  const code = event?.code ?? 'unknown';
  const reason = event?.reason || '';
  recordDisconnect(`shard=${shardId} code=${code} ${reason}`.trim());
});
client.on('shardError', (error, shardId) => {
  console.error('Shard error:', shardId, error);
  warnThrottled(
    'discordShardError',
    `${BOT_ALERT_PREFIX}: shardError shard=${shardId}\n${String(error?.stack || error)}`,
    10 * 60 * 1000
  );
});
client.on('error', error => {
  console.error('Discord client error:', error);
  warnThrottled(
    'discordClientError',
    `${BOT_ALERT_PREFIX}: client error\n${String(error?.stack || error)}`,
    10 * 60 * 1000
  );
});

// Event-loop lag + memory warnings.
const EVENT_LOOP_LAG_WARN_MS = Number(process.env.EVENT_LOOP_LAG_WARN_MS || 250);
const EVENT_LOOP_LAG_THROTTLE_MS = Number(process.env.EVENT_LOOP_LAG_THROTTLE_MS || 10 * 60 * 1000);
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const drift = now - lastTick - 1000;
  lastTick = now;
  if (drift > EVENT_LOOP_LAG_WARN_MS) {
    warnThrottled(
      'eventLoopLag',
      `${BOT_ALERT_PREFIX}: Event-loop lag high (${Math.round(drift)}ms). This can cause Discord heartbeat timeouts.`,
      EVENT_LOOP_LAG_THROTTLE_MS
    );
  }
}, 1000).unref();

const MEMORY_WARN_RSS_MB = Number(process.env.MEMORY_WARN_RSS_MB || 450);
setInterval(() => {
  const rssMb = process.memoryUsage().rss / 1024 / 1024;
  if (rssMb >= MEMORY_WARN_RSS_MB) {
    warnThrottled(
      'memoryHigh',
      `${BOT_ALERT_PREFIX}: Memory RSS high (${rssMb.toFixed(1)} MB)`,
      10 * 60 * 1000
    );
  }
}, 60_000).unref();

client.inviteCache = new Map();

async function refreshInviteCache() {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return;
    const guild = await client.guilds.fetch(guildId);
    const invites = await guild.invites.fetch();
    client.inviteCache = new Map(invites.map(inv => [inv.code, inv.uses || 0]));
  } catch (err) {
    console.error('Failed to refresh invite cache:', err);
  }
}

client.once(Events.ClientReady, async c => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`[PRESENCE] Configured presence: ${CURRENT_BOT_PRESENCE}`);
  client.user.setPresence({
    activities: [{ name: CURRENT_BOT_PRESENCE, type: 0 }],
    status: 'online'
  });
  console.log(`[PRESENCE] Applied presence: ${CURRENT_BOT_PRESENCE}`);
  await refreshInviteCache();

  // Register slash commands at startup
  try {
    const { REST, Routes } = require('discord.js');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const guildId = process.env.GUILD_ID;
    const clientId = process.env.CLIENT_ID || c.user.id;

    const commands = [
      new SlashCommandBuilder()
        .setName('pending_requests')
        .setDescription('Просмотр запросов на роли (для модераторов)')
        .addStringOption(option =>
          option
            .setName('статус')
            .setDescription('Фильтр по статусу')
            .setRequired(false)
            .addChoices(
              { name: '⏳ Ожидающие', value: 'pending' },
              { name: '✅ Одобренные', value: 'approved' },
              { name: '❌ Отклонённые', value: 'rejected' },
              { name: '⏰ Истёкшие', value: 'expired' },
              { name: '📋 Все', value: 'all' }
            )
        )
        .toJSON()
    ];

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('[CMD] Registered /pending_requests slash command for guild.');
    }
  } catch (err) {
    console.error('[CMD] Failed to register slash commands:', err.message);
  }

  // Ensure role request panel exists in the requests channel
  try {
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      const guild = await client.guilds.fetch(guildId);
      await ensureRoleRequestPanel(guild);
      console.log('[RoleRequests] Panel check complete.');

      // Lock down #запросы-ролей: only bot can send messages, everyone else uses buttons
      await lockdownRoleRequestsChannel(guild);
    }
  } catch (err) {
    console.error('[RoleRequests] Failed to ensure panel:', err.message);
  }

  // Start auto-expiry timer
  try {
    await expireStaleRoleRequests();
  } catch (err) {
    console.error('[Expiry] Initial expiry check failed:', err.message);
  }
  setInterval(async () => {
    try {
      await expireStaleRoleRequests();
    } catch (err) {
      console.error('[Expiry] Periodic expiry check failed:', err.message);
    }
  }, EXPIRY_CHECK_INTERVAL_MS).unref();

  console.log('[CMD] Role request system initialized with buttons, modals & auto-expiry.');
});

// Auto roles on member join (members + bots + invite mapping)
client.on(Events.GuildMemberAdd, async member => {
  const autoCfg = loadAutoRoles();
  const rolesToAdd = [];

  if (member.user.bot) {
    if (autoCfg.botEnabled) rolesToAdd.push(...(autoCfg.botRoles || []));
  } else {
    if (autoCfg.enabled) rolesToAdd.push(...(autoCfg.autoRoles || []));
  }

  // Detect which invite was used
  let usedCode = null;
  try {
    const prev = client.inviteCache || new Map();
    const invites = await member.guild.invites.fetch();
    invites.forEach(inv => {
      const oldUses = prev.get(inv.code) || 0;
      if ((inv.uses || 0) > oldUses) usedCode = inv.code;
    });
    client.inviteCache = new Map(
      invites.map(inv => [inv.code, inv.uses || 0])
    );
  } catch (err) {
    console.error('Error detecting invite used:', err);
  }

  if (usedCode && autoCfg.inviteRoles && autoCfg.inviteRoles.length) {
    for (const ir of autoCfg.inviteRoles) {
      if (ir.code === usedCode && ir.roleId) rolesToAdd.push(ir.roleId);
    }
  }

  const uniqueRoles = [...new Set(rolesToAdd)].filter(id =>
    member.guild.roles.cache.has(id)
  );
  if (!uniqueRoles.length) return;

  try {
    await member.roles.add(uniqueRoles, `Auto roles by ${BOT_ALERT_PREFIX}`);
  } catch (err) {
    console.error('Error assigning auto roles:', err);
  }
});

// Message tracking for 100% accuracy
client.on(Events.MessageCreate, async message => {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  const messageData = loadMessages();

  if (!messageData[guildId]) {
    messageData[guildId] = {};
  }

  if (!messageData[guildId][userId]) {
    messageData[guildId][userId] = {
      count: 0,
      username: message.author.username,
      lastMessage: null
    };
  }

  messageData[guildId][userId].count++;
  messageData[guildId][userId].username = message.author.username;
  messageData[guildId][userId].lastMessage = new Date().toISOString();

  saveMessages(messageData);

  try {
    await handleRecruitmentRoleRequestMessage(message);
  } catch (err) {
    console.error('Recruitment role request message error:', err);
  }

  try {
    await enforceRecruitmentAnnouncementMessage(message);
  } catch (err) {
    console.error('Recruitment enforcement error:', err);
  }
});

// InteractionCreate — buttons, modals, slash commands
client.on(Events.InteractionCreate, async interaction => {
  try {
    await handleInteractionCreate(interaction);
  } catch (err) {
    console.error('InteractionCreate error:', err);
    // Try to respond to the user if we haven't already
    try {
      const content = '❌ Произошла ошибка при обработке взаимодействия.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    } catch {
      // can't respond — ignore
    }
  }
});

// ------------------------------------------------------
// Web panel (Express) – glassmorphism multi-page
// ------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;
const WEBUI_AUTH_TOKEN =
  process.env.WEBUI_AUTH_TOKEN || (config.webui && config.webui.authToken) || '';
const WEBUI_REQUIRE_AUTH =
  String(
    process.env.WEBUI_REQUIRE_AUTH ??
      ((config.webui && config.webui.requireAuth) ??
        (process.env.NODE_ENV === 'production'))
  ).toLowerCase() === 'true';
const WEBUI_LOGIN_USERNAME = process.env.WEBUI_LOGIN_USERNAME || 'admin';
const WEBUI_LOGIN_PASSWORD =
  process.env.WEBUI_LOGIN_PASSWORD || WEBUI_AUTH_TOKEN || '';
const WEBUI_SESSION_SECRET =
  process.env.WEBUI_SESSION_SECRET || WEBUI_LOGIN_PASSWORD || WEBUI_AUTH_TOKEN;
const WEBUI_SESSION_COOKIE = 'vproject_webui_session';
const WEBUI_SESSION_TTL_SEC = Number(
  process.env.WEBUI_SESSION_TTL_SEC || 12 * 60 * 60
);
const WEBUI_SESSION_ROLLING =
  String(process.env.WEBUI_SESSION_ROLLING || 'true').toLowerCase() !== 'false';
const WEBUI_COOKIE_SECURE =
  String(process.env.WEBUI_COOKIE_SECURE || 'false').toLowerCase() === 'true';

function createWebUiSession(username) {
  if (!WEBUI_SESSION_SECRET) return '';
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${username}:${issuedAt}`;
  const signature = crypto
    .createHmac('sha256', WEBUI_SESSION_SECRET)
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${signature}`, 'utf8').toString('base64url');
}

function getWebUiSessionUsername(value) {
  if (!value || !WEBUI_SESSION_SECRET) return null;

  let decoded;
  try {
    decoded = Buffer.from(String(value), 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const parts = decoded.split(':');
  if (parts.length < 3) return null;

  const issuedAtRaw = parts[parts.length - 2];
  const signature = parts[parts.length - 1];
  const username = parts.slice(0, -2).join(':');

  if (!username || !issuedAtRaw || !signature) return null;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt > WEBUI_SESSION_TTL_SEC) return null;

  const payload = `${username}:${issuedAt}`;
  const expected = crypto
    .createHmac('sha256', WEBUI_SESSION_SECRET)
    .update(payload)
    .digest('hex');

  if (!secureEquals(signature, expected)) return null;
  return username;
}

function buildSessionCookie(value, req, maxAgeSec) {
  const shouldSecure = WEBUI_COOKIE_SECURE || !!req.secure;
  return [
    `${WEBUI_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    shouldSecure ? 'Secure' : ''
  ]
    .filter(Boolean)
    .join('; ');
}

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Security middleware - basic rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 30;

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }
  
  const requests = requestCounts.get(ip).filter(time => now - time < RATE_LIMIT_WINDOW);
  requests.push(now);
  requestCounts.set(ip, requests);
  
  if (requests.length > MAX_REQUESTS) {
    return res.status(429).json({ 
      ok: false, 
      message: 'Too many requests. Please slow down.' 
    });
  }
  
  next();
});

// Cleanup old rate limit data every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, requests] of requestCounts.entries()) {
    const filtered = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
    if (filtered.length === 0) {
      requestCounts.delete(ip);
    } else {
      requestCounts.set(ip, filtered);
    }
  }
}, 300000);

// static files (for future logo, css, etc.)
// Put your logo at: project_root/public/logo.png and uncomment <img> in layout.
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// Fast local healthcheck endpoint (for systemd timer / Cloudflare origin check)
app.get('/healthz', (req, res) => {
  res.status(200).json({
    ok: true,
    discordReady: typeof client.isReady === 'function' ? client.isReady() : false,
    presenceConfigured: CURRENT_BOT_PRESENCE,
    phase: PROJECT_PHASE,
    uptimeSec: Math.round(process.uptime()),
    now: new Date().toISOString()
  });
});

app.get('/login', (req, res) => {
  if (!WEBUI_REQUIRE_AUTH) {
    return res.redirect('/');
  }

  const existing = parseCookieHeader(req.headers.cookie || '');
  if (getWebUiSessionUsername(existing[WEBUI_SESSION_COOKIE])) {
    return res.redirect('/');
  }

  const hasCredentials = !!(WEBUI_LOGIN_PASSWORD && WEBUI_SESSION_SECRET);
  const error = toSingleString(req.query && req.query.error, '').trim();

  return res.status(hasCredentials ? 200 : 503).send(`
    <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(PANEL_TITLE)} · Login</title>
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          color: #e5e7eb;
          background: radial-gradient(circle at top, #020617 0, #020617 40%, #000000 100%);
        }
        .card {
          width: min(420px, calc(100vw - 28px));
          background: linear-gradient(145deg, rgba(15,23,42,0.92), rgba(15,23,42,0.76));
          border: 1px solid rgba(148,163,184,0.35);
          box-shadow: 0 18px 38px rgba(2,6,23,0.75);
          border-radius: 18px;
          padding: 20px;
        }
        h1 { margin: 0 0 8px; font-size: 1.1rem; }
        p { margin: 0 0 12px; color: #9ca3af; font-size: 0.9rem; }
        label { display: block; margin-top: 10px; font-size: 0.86rem; }
        input {
          width: 100%;
          margin-top: 6px;
          padding: 9px 10px;
          border-radius: 10px;
          border: 1px solid rgba(148,163,184,0.45);
          background: rgba(15,23,42,0.9);
          color: #e5e7eb;
          outline: none;
        }
        input:focus {
          border-color: rgba(59,130,246,0.9);
          box-shadow: 0 0 0 1px rgba(59,130,246,0.55);
        }
        .btn {
          width: 100%;
          margin-top: 14px;
          border: none;
          border-radius: 999px;
          padding: 10px 14px;
          cursor: pointer;
          color: #fff;
          font-weight: 600;
          background: linear-gradient(135deg, #3b82f6, #22c55e);
        }
        .error { margin-top: 8px; color: #fca5a5; font-size: 0.82rem; }
        .warn { margin-top: 8px; color: #fbbf24; font-size: 0.82rem; }
      </style>
    </head>
    <body>
      <section class="card">
        <h1>${escapeHtml(PANEL_TITLE)}</h1>
        <p>Sign in to access the control panel.</p>
        <form method="POST" action="/login">
          <label>
            Username
            <input type="text" name="username" autocomplete="username" required />
          </label>
          <label>
            Password
            <input type="password" name="password" autocomplete="current-password" required />
          </label>
          <button class="btn" type="submit">Sign in</button>
        </form>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
        ${!hasCredentials ? '<div class="warn">Login is not configured. Set WEBUI_LOGIN_PASSWORD (or WEBUI_AUTH_TOKEN) and restart the bot service.</div>' : ''}
      </section>
    </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  if (!WEBUI_REQUIRE_AUTH) {
    return res.redirect('/');
  }

  if (!WEBUI_LOGIN_PASSWORD || !WEBUI_SESSION_SECRET) {
    return res.status(503).json({
      ok: false,
      message:
        'WebUI login is not configured. Set WEBUI_LOGIN_PASSWORD (or WEBUI_AUTH_TOKEN) and restart the service.'
    });
  }

  const username = toSingleString(req.body && req.body.username, '').trim();
  const password = toSingleString(req.body && req.body.password, '');

  const usernameOk = secureEquals(username, WEBUI_LOGIN_USERNAME);
  const passwordOk = secureEquals(password, WEBUI_LOGIN_PASSWORD);

  if (!usernameOk || !passwordOk) {
    return res.redirect('/login?error=Invalid%20credentials');
  }

  const session = createWebUiSession(username);
  const cookie = buildSessionCookie(session, req, WEBUI_SESSION_TTL_SEC);

  res.setHeader('Set-Cookie', cookie);
  return res.redirect('/');
});

app.post('/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    buildSessionCookie('', req, 0)
  );
  return res.redirect('/login');
});

function webUiAuth(req, res, next) {
  if (!WEBUI_REQUIRE_AUTH) return next();

  if (req.path === '/login' || req.path === '/logout') {
    return next();
  }

  if (!WEBUI_LOGIN_PASSWORD || !WEBUI_SESSION_SECRET) {
    const wantsHtml =
      req.method === 'GET' &&
      toSingleString(req.headers.accept, '').includes('text/html');
    if (wantsHtml) {
      return res.redirect('/login?error=Login%20is%20not%20configured');
    }

    return res.status(503).json({
      ok: false,
      message:
        'WebUI auth is required but login credentials are not configured. Set WEBUI_LOGIN_PASSWORD (or WEBUI_AUTH_TOKEN).'
    });
  }

  const cookies = parseCookieHeader(req.headers.cookie || '');
  const sessionValue = cookies[WEBUI_SESSION_COOKIE] || '';
  const sessionUser = getWebUiSessionUsername(sessionValue);
  if (sessionUser) {
    if (WEBUI_SESSION_ROLLING) {
      const refreshed = createWebUiSession(sessionUser);
      res.setHeader('Set-Cookie', buildSessionCookie(refreshed, req, WEBUI_SESSION_TTL_SEC));
    }
    return next();
  }

  const headerToken = toSingleString(req.headers['x-webui-token'], '').trim();
  const authHeader = toSingleString(req.headers.authorization, '').trim();
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  const queryToken = toSingleString(req.query && req.query.token, '').trim();
  const bodyToken = toSingleString(req.body && req.body.token, '').trim();

  const supplied = headerToken || bearer || queryToken || bodyToken;
  if (supplied && WEBUI_AUTH_TOKEN && secureEquals(supplied, WEBUI_AUTH_TOKEN)) {
    return next();
  }

  const wantsHtml =
    req.method === 'GET' &&
    toSingleString(req.headers.accept, '').includes('text/html');
  if (wantsHtml) {
    return res.redirect('/login');
  }

  if (!supplied) {
    return res.status(401).json({
      ok: false,
      message: 'Unauthorized. Sign in via /login or provide valid token.'
    });
  }

  return res.status(401).json({
    ok: false,
    message: 'Unauthorized. Provided token is invalid.'
  });
}

app.use(webUiAuth);

/**
 * Render base layout with glassmorphism style.
 * @param {string} active - 'overview' | 'embeds' | 'autoroles'
 * @param {string} bodyHtml - inner HTML for main content
 * @param {string} extraScript - page-specific JS (without <script> tags)
 */
function renderLayout(active, bodyHtml, extraScript) {
  return `
  <html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
    <title>${escapeHtml(PANEL_TITLE)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        color: #e5e7eb;
        background: radial-gradient(circle at top, #020617 0, #020617 40%, #000000 100%);
        min-height: 100vh;
      }
      a { color: #93c5fd; text-decoration: none; }

      .page {
        min-height: 100vh;
        display: flex;
      }

      .sidebar {
        width: 250px;
        padding: 18px 16px;
        border-right: 1px solid rgba(148,163,184,0.24);
        background: linear-gradient(180deg, rgba(15,23,42,0.96), rgba(15,23,42,0.7));
        display: flex;
        flex-direction: column;
      }
      .sidebar-header {
        margin-bottom: 18px;
      }
      .sidebar-title {
        font-size: 1rem;
        font-weight: 600;
      }
      .sidebar-sub {
        font-size: 0.78rem;
        color: #9ca3af;
      }

      .sidebar-logo {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        margin-bottom: 10px;
        display: block;
        object-fit: cover;
        box-shadow: 0 8px 18px rgba(2, 6, 23, 0.45);
        border: 1px solid rgba(148,163,184,0.28);
      }

      .bot-status {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(15,23,42,0.8);
        font-size: 0.75rem;
      }
      .bot-status .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22c55e;
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .nav-section-title {
        margin-top: 12px;
        margin-bottom: 4px;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: #6b7280;
      }
      .nav-list { list-style: none; margin: 0; padding: 0; }
      .nav-item { margin-bottom: 4px; }
      .nav-link {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 8px;
        border-radius: 10px;
        font-size: 0.9rem;
        color: #e5e7eb;
        background: transparent;
        transition: background 0.15s ease, transform 0.1s ease;
      }
      .nav-link span.icon {
        width: 18px;
        text-align: center;
        opacity: 0.9;
      }
      .nav-link:hover {
        background: rgba(148,163,184,0.16);
        transform: translateX(1px);
      }
      .nav-link.active {
        background: linear-gradient(135deg, rgba(59,130,246,0.85), rgba(16,185,129,0.85));
        box-shadow: 0 10px 25px rgba(15,23,42,0.8);
      }

      .content {
        flex: 1;
        padding: 20px 26px 26px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        background: radial-gradient(circle at 0 0, rgba(37,99,235,0.28), transparent 55%),
                    radial-gradient(circle at 100% 100%, rgba(16,185,129,0.12), transparent 55%),
                    linear-gradient(180deg, #020617, #020617);
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
      }
      .section-header h1 {
        margin: 0;
        font-size: 1.3rem;
      }
      .section-header small {
        color: #9ca3af;
      }

      .glass-card {
        background: linear-gradient(145deg, rgba(15,23,42,0.9), rgba(15,23,42,0.75));
        border-radius: 18px;
        border: 1px solid rgba(148,163,184,0.35);
        box-shadow: 0 20px 40px rgba(15,23,42,0.9);
        padding: 18px 20px;
      }

      label {
        display: block;
        margin-top: 12px;
        font-size: 0.9rem;
      }
      select, input[type="text"], textarea {
        width: 100%;
        padding: 8px 10px;
        margin-top: 6px;
        border-radius: 10px;
        border: 1px solid rgba(148,163,184,0.4);
        background: rgba(15,23,42,0.88);
        color: #e5e7eb;
        font-size: 0.9rem;
        outline: none;
        transition: border 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }
      select:focus, input[type="text"]:focus, textarea:focus {
        border-color: rgba(59,130,246,0.9);
        box-shadow: 0 0 0 1px rgba(59,130,246,0.5);
        background: rgba(15,23,42,0.98);
      }
      textarea {
        resize: vertical;
        min-height: 110px;
      }

      .row {
        display: flex;
        gap: 16px;
      }
      .row > div { flex: 1; }

      .btn-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }

      button.primary, button.secondary {
        padding: 8px 16px;
        border-radius: 999px;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.9rem;
      }
      button.primary {
        background: linear-gradient(135deg, #3b82f6, #22c55e);
        color: white;
      }
      button.primary:hover { filter: brightness(1.05); }
      button.secondary {
        background: rgba(15,23,42,0.95);
        color: #e5e7eb;
        border: 1px solid rgba(148,163,184,0.55);
      }
      button.secondary[disabled] {
        opacity: 0.35;
        cursor: default;
      }
      button.secondary:not([disabled]):hover {
        background: rgba(15,23,42,1);
      }

      .hint {
        margin-top: 10px;
        font-size: 0.8rem;
        color: #9ca3af;
      }

      .embed-preview {
        margin-top: 14px;
        padding: 10px 14px;
        border-radius: 14px;
        background: radial-gradient(circle at top left, rgba(59,130,246,0.25), rgba(15,23,42,0.96));
        border-left: 3px solid rgba(59,130,246,0.9);
        font-size: 0.9rem;
      }
      .embed-title { font-weight: 600; margin-bottom: 4px; }
      .embed-description { white-space: pre-wrap; color: #d1d5db; }

      .embed-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .embed-card, .embed-card-create {
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(15,23,42,0.85);
        border: 1px solid rgba(148,163,184,0.45);
        font-size: 0.85rem;
      }
      .embed-card.active {
        border-color: rgba(59,130,246,0.9);
        box-shadow: 0 0 0 1px rgba(59,130,246,0.5);
      }
      .embed-card-create {
        border-style: dashed;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #9ca3af;
      }
      .embed-card-create:hover {
        background: rgba(15,23,42,0.98);
      }
      .embed-card-title {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .embed-card-sub {
        font-size: 0.8rem;
        color: #9ca3af;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .embed-card-footer {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:6px;
        margin-top:6px;
      }
      .small-btn {
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid rgba(148,163,184,0.6);
        background: rgba(15,23,42,0.95);
        color: #e5e7eb;
        font-size: 0.75rem;
      }
      .small-btn:hover {
        background: rgba(15,23,42,1);
      }
      .last-sent { font-size:0.75rem; color:#9ca3af; }
      .last-sent.muted { opacity:0.6; }

      .color-field {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .color-field input[type="text"] { flex: 1; }
      .color-field input[type="color"] {
        width: 46px;
        height: 32px;
        padding: 0;
        border-radius: 999px;
        border: 1px solid rgba(148,163,184,0.6);
        background: rgba(15,23,42,0.9);
        cursor: pointer;
      }

      .switch-row {
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-top:12px;
        font-size:0.9rem;
      }
      .switch {
        position: relative;
        display: inline-block;
        width: 46px;
        height: 24px;
      }
      .switch input { opacity:0; width:0; height:0; }
      .slider {
        position:absolute; inset:0;
        background-color: rgba(148,163,184,0.7);
        border-radius:999px;
        transition:.2s;
      }
      .slider:before {
        position:absolute;
        content:"";
        width:18px; height:18px;
        left:3px; bottom:3px;
        background:white;
        border-radius:999px;
        transition:.2s;
      }
      .switch input:checked + .slider {
        background: linear-gradient(135deg,#22c55e,#3b82f6);
      }
      .switch input:checked + .slider:before {
        transform:translateX(20px);
      }

      .invite-rows { margin-top:10px; display:flex; flex-direction:column; gap:8px; }
      .invite-row { display:flex; gap:8px; }
      .invite-row .invite-code { flex:1.2; }
      .invite-row .invite-role { flex:1.4; }

      /* Auto roles chips */
      .auto-roles-grid {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .role-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(15,23,42,0.96);
        border: 1px solid rgba(148,163,184,0.5);
        font-size: 0.82rem;
        cursor: pointer;
      }
      .role-chip input[type="checkbox"] {
        accent-color: #3b82f6;
      }
      .role-chip span {
        white-space: nowrap;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .auto-roles-top {
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        margin-bottom:10px;
      }
      .auto-roles-top-text {
        font-size:0.9rem;
        color:#d1d5db;
      }
      .auto-roles-top-text span {
        display:block;
        color:#9ca3af;
        font-size:0.8rem;
        margin-top:4px;
      }
      .auto-roles-toggles {
        display:flex;
        flex-direction:column;
        gap:8px;
        font-size:0.85rem;
      }
      .auto-roles-column-title {
        font-weight:600;
        font-size:0.9rem;
        margin-top:4px;
      }

      .toast {
        position: fixed;
        bottom: 16px;
        right: 16px;
        background-color: #16a34a;
        color: #f9fafb;
        padding: 10px 16px;
        border-radius: 999px;
        font-size: 0.85rem;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        opacity: 0;
        pointer-events: none;
        transform: translateY(10px);
        transition: opacity .2s ease-out, transform .2s ease-out;
        z-index: 50;
      }
      .toast.error { background-color:#dc2626; }
      .toast.show { opacity:1; transform:translateY(0); }

      @media (max-width: 900px) {
        .page { flex-direction:column; }
        .sidebar { width:100%; flex-direction:row; align-items:center; gap:16px; overflow-x:auto; }
        .content { padding:14px; }
        .row { flex-direction:column; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <aside class="sidebar">
        <div>
          <div class="sidebar-header">
            <img src="/static/logo.svg" class="sidebar-logo" alt="${escapeHtml(BRAND_NAME)} logo" />
            <div class="sidebar-title">${escapeHtml(PANEL_HEADER_TITLE)}</div>
            <div class="sidebar-sub">${escapeHtml(PANEL_HEADER_SUBTITLE)}</div>
            <div class="bot-status">
              <span class="status-dot"></span>
              <span>Bot Online</span>
            </div>
          </div>

          <div class="nav-section-title">General</div>
          <ul class="nav-list">
            <li class="nav-item">
              <a href="/" class="nav-link ${active === 'overview' ? 'active' : ''}">
                <span class="icon">👁️</span><span>Overview</span>
              </a>
            </li>
          </ul>

          <div class="nav-section-title">Modules</div>
          <ul class="nav-list">
            <li class="nav-item">
              <a href="/stats" class="nav-link ${active === 'stats' ? 'active' : ''}">
                <span class="icon">📊</span><span>Message Stats</span>
              </a>
            </li>
            <li class="nav-item">
              <a href="/embeds" class="nav-link ${active === 'embeds' ? 'active' : ''}">
                <span class="icon">🧾</span><span>Embed Messages</span>
              </a>
            </li>
            <li class="nav-item">
              <a href="/auto-roles" class="nav-link ${active === 'autoroles' ? 'active' : ''}">
                <span class="icon">🎭</span><span>Auto Roles</span>
              </a>
            </li>
            <li class="nav-item">
              <a href="/recruitment" class="nav-link ${active === 'recruitment' ? 'active' : ''}">
                <span class="icon">🧩</span><span>Recruitment</span>
              </a>
            </li>
          </ul>
            <div style="margin-top:14px;">
              <form method="POST" action="/logout" style="margin:0;">
                <button type="submit" class="secondary" style="width:100%;">Sign out</button>
              </form>
            </div>
        </div>
      </aside>

      <main class="content">
        ${bodyHtml}
      </main>
    </div>

    <div id="toast" class="toast"></div>

    <script>
      (function() {
        function showToast(message, isError) {
          var t = document.getElementById('toast');
          if (!t) return;
          t.textContent = message || (isError ? 'Error' : 'Done');
          t.className = 'toast' + (isError ? ' error' : '');
          void t.offsetWidth;
          t.classList.add('show');
          setTimeout(function () {
            t.classList.remove('show');
          }, 2500);
        }

        window.VPANEL_TOAST = showToast;

        ${extraScript || ''}
      })();
    </script>
  </body>
  </html>
  `;
}

// ------------------------------------------------------
// Page: Overview
// ------------------------------------------------------

app.get('/', async (req, res) => {
  const bodyHtml = `
    <section>
      <div class="section-header">
        <h1>Overview</h1>
        <small>${escapeHtml(PANEL_OVERVIEW_SUBTITLE)}</small>
      </div>
      <div class="glass-card">
        <p>Use the navigation on the left to manage individual modules:</p>
        <ul>
          <li><strong>Message Stats</strong> – view real-time message counts and leaderboard for all server members.</li>
          <li><strong>Embed Messages</strong> – create, save and resend embed messages (rules, info, announcements).</li>
          <li><strong>Auto Roles</strong> – assign roles automatically when members or bots join, including per-invite roles.</li>
        </ul>
        <p>This layout is intentionally minimal, so you can add more modules (logs, automod, giveaways, etc.) later.</p>
      </div>

      <div class="glass-card" style="margin-top:14px;">
        <h2 style="margin-top:0;font-size:1rem;">Bot Status</h2>
        <form id="botStatusForm">
          <label>
            Presence text
            <input type="text" name="presence" maxlength="120" required value="${escapeHtml(CURRENT_BOT_PRESENCE)}" />
          </label>
          <div class="btn-row">
            <button type="submit" class="primary">Update status</button>
          </div>
          <div class="hint">Applies immediately and is saved to config for next restart.</div>
        </form>
      </div>
    </section>
  `;

  const extraScript = `
    function getToast() { return window.VPANEL_TOAST || function(){}; }
    var showToast = getToast();
    var statusForm = document.getElementById('botStatusForm');

    if (statusForm) {
      statusForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(statusForm);
        var presence = (fd.get('presence') || '').toString().trim();

        fetch('/bot-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presence: presence })
        })
          .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (result) {
            if (!result.ok) {
              showToast(result.data.message || 'Failed to update status', true);
              return;
            }
            showToast(result.data.message || 'Status updated', false);
          })
          .catch(function () {
            showToast('Network error while updating status', true);
          });
      });
    }
  `;

  res.send(renderLayout('overview', bodyHtml, extraScript));
});

// ------------------------------------------------------
// Page: Message Stats & Leaderboard
// ------------------------------------------------------

app.get('/stats', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(500).send('GUILD_ID is not set in .env');
    }

    const messageData = loadMessages();
    const guildData = messageData[guildId] || {};

    // Convert to array and sort by count
    const leaderboard = Object.entries(guildData)
      .map(([userId, data]) => ({
        userId,
        username: data.username || 'Unknown',
        count: data.count || 0,
        lastMessage: data.lastMessage || null
      }))
      .sort((a, b) => b.count - a.count);

    const totalMessages = leaderboard.reduce((sum, user) => sum + user.count, 0);
    const totalUsers = leaderboard.length;

    let leaderboardHtml = '';
    if (leaderboard.length === 0) {
      leaderboardHtml = '<p class="hint">No messages tracked yet. Members need to send messages first.</p>';
    } else {
      leaderboardHtml = `
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
            <thead>
              <tr style="border-bottom:1px solid rgba(148,163,184,0.3);">
                <th style="text-align:left; padding:8px;">#</th>
                <th style="text-align:left; padding:8px;">Username</th>
                <th style="text-align:right; padding:8px;">Messages</th>
                <th style="text-align:right; padding:8px;">Last Active</th>
              </tr>
            </thead>
            <tbody>
              ${leaderboard.slice(0, 100).map((user, idx) => {
                const lastActive = user.lastMessage 
                  ? new Date(user.lastMessage).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—';
                return `
                  <tr style="border-bottom:1px solid rgba(148,163,184,0.15);">
                    <td style="padding:8px; color:#9ca3af;">${idx + 1}</td>
                    <td style="padding:8px;">${escapeHtml(user.username)}</td>
                    <td style="padding:8px; text-align:right; font-weight:600; color:#22c55e;">${user.count.toLocaleString()}</td>
                    <td style="padding:8px; text-align:right; color:#9ca3af; font-size:0.85rem;">${escapeHtml(lastActive)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    const bodyHtml = `
      <section>
        <div class="section-header">
          <h1>Message Statistics</h1>
          <small>Real-time message tracking for all server members.</small>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:18px;">
          <div class="glass-card" style="text-align:center;">
            <div style="font-size:2rem; font-weight:700; color:#22c55e;">${totalMessages.toLocaleString()}</div>
            <div style="font-size:0.85rem; color:#9ca3af; margin-top:4px;">Total Messages</div>
          </div>
          <div class="glass-card" style="text-align:center;">
            <div style="font-size:2rem; font-weight:700; color:#3b82f6;">${totalUsers.toLocaleString()}</div>
            <div style="font-size:0.85rem; color:#9ca3af; margin-top:4px;">Active Users</div>
          </div>
          <div class="glass-card" style="text-align:center;">
            <div style="font-size:2rem; font-weight:700; color:#a855f7;">${leaderboard.length > 0 ? Math.round(totalMessages / totalUsers) : 0}</div>
            <div style="font-size:0.85rem; color:#9ca3af; margin-top:4px;">Avg per User</div>
          </div>
        </div>

        <div class="glass-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h2 style="margin:0; font-size:1.1rem;">Leaderboard (Top 100)</h2>
            <form method="POST" action="/reset-stats" id="resetForm" style="margin:0;">
              <button type="submit" class="secondary" style="font-size:0.85rem; padding:6px 12px;">Reset All Stats</button>
            </form>
          </div>
          ${leaderboardHtml}
        </div>
      </section>
    `;

    const extraScript = `
      function getToast() { return window.VPANEL_TOAST || function(){}; }
      var showToast = getToast();

      var resetForm = document.getElementById('resetForm');
      if (resetForm) {
        resetForm.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!confirm('Are you sure you want to reset ALL message statistics? This cannot be undone.')) {
            return;
          }

          fetch('/reset-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          })
            .then(function (res) {
              return res.json().then(function (data) {
                return { ok: res.ok, data: data };
              });
            })
            .then(function (result) {
              if (result.ok) {
                showToast(result.data.message || 'Stats reset', false);
                setTimeout(function () { window.location.reload(); }, 1000);
              } else {
                showToast(result.data.message || 'Failed to reset stats', true);
              }
            })
            .catch(function () {
              showToast('Network error while resetting stats', true);
            });
        });
      }
    `;

    res.send(renderLayout('stats', bodyHtml, extraScript));
  } catch (err) {
    console.error('Error rendering stats page:', err);
    res.status(500).send('Error loading stats page. Check console.');
  }
});

// ------------------------------------------------------
// Page: Embeds (list + editor)
// ------------------------------------------------------

app.get('/embeds', async (req, res) => {
  await renderEmbedsPage(res, null);
});

app.get('/embeds/:id', async (req, res) => {
  await renderEmbedsPage(res, req.params.id);
});

async function renderEmbedsPage(res, selectedEmbedId) {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(500).send('GUILD_ID is not set in .env');
    }

    const guild = await client.guilds.fetch(guildId);
    await guild.channels.fetch();

    const textChannels = guild.channels.cache
      .filter(ch => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
      .sort((a, b) => a.rawPosition - b.rawPosition);

    const embeds = loadEmbeds();
    const selectedEmbed =
      selectedEmbedId && embeds.length
        ? embeds.find(e => e.id === selectedEmbedId)
        : null;

    const channelNameMap = {};
    textChannels.forEach(ch => {
      channelNameMap[ch.id] = ch.name;
    });

    const selectedChannelId =
      (selectedEmbed && selectedEmbed.lastChannelId) ||
      (textChannels.first() && textChannels.first().id) ||
      null;

    const channelOptionsHtml = textChannels
      .map(
        ch =>
          `<option value="${ch.id}" ${
            ch.id === selectedChannelId ? 'selected' : ''
          }>#${escapeHtml(ch.name)}</option>`
      )
      .join('\n');

    const embedCardsHtml =
      embeds.length === 0
        ? '<p class="hint">No saved embeds yet. Give your embed a name and send it once to save it.</p>'
        : embeds
            .map(e => {
              const lastName = e.lastChannelId
                ? channelNameMap[e.lastChannelId] || e.lastChannelId
                : null;
              const lastInfo = lastName
                ? `Last in #${escapeHtml(lastName)}`
                : 'Not sent yet';
              return `
                <div class="embed-card" data-name="${escapeHtml(e.name)}">
                  <div class="embed-card-title">${escapeHtml(e.name)}</div>
                  <div class="embed-card-sub">${escapeHtml(e.title || '')}</div>
                  <div class="embed-card-footer">
                    <a href="/embeds/${e.id}" class="small-btn">Open</a>
                    <span class="last-sent ${lastName ? '' : 'muted'}">${escapeHtml(
                      lastInfo
                    )}</span>
                  </div>
                </div>
              `;
            })
            .join('\n');

    const initialName = selectedEmbed ? selectedEmbed.name || '' : '';
    const initialTitle = selectedEmbed ? selectedEmbed.title || '' : '';
    const initialDesc = selectedEmbed ? selectedEmbed.description || '' : '';
    const initialColor = selectedEmbed ? selectedEmbed.color || '' : '';
    const embedIdHidden = selectedEmbed ? selectedEmbed.id : '';
    const canEditLast =
      selectedEmbed &&
      selectedEmbed.lastChannelId &&
      selectedEmbed.lastMessageId;

    const previewTitleText = initialTitle || 'Embed title';
    const previewDescText =
      initialDesc || 'Embed description will appear here as you type.';

    const bodyHtml = `
      <section>
        <div class="section-header">
          <h1>Embed Messages</h1>
          <small>Create, save and reuse embed messages.</small>
        </div>

        <div class="glass-card">
          <form method="POST" action="/send-embed" id="embedForm">
            <input type="hidden" name="embedId" value="${escapeHtml(
              embedIdHidden
            )}" />
            <input type="hidden" name="action" id="embed-action" value="send" />

            <label>
              Find channel
              <input type="text" id="channel-search" placeholder="Type channel name" />
            </label>

            <label>
              Channel
              <select name="channelId" id="channel-select" required>
                ${channelOptionsHtml}
              </select>
              <div class="hint">
                Sending to:
                <span id="channel-preview-name">${
                  selectedChannelId
                    ? '#' + escapeHtml(channelNameMap[selectedChannelId])
                    : '—'
                }</span>
              </div>
            </label>

            <div class="row">
              <div>
                <label>
                  Internal Name (for library)
                  <input
                    type="text"
                    name="name"
                    id="name-input"
                    placeholder="e.g. Info, Rules, Giveaway"
                    value="${escapeHtml(initialName)}"
                  />
                </label>
              </div>
              <div>
                <label>
                  Color
                  <div class="color-field">
                    <input
                      type="text"
                      name="color"
                      id="color-input"
                      placeholder="#2563eb (optional)"
                      value="${escapeHtml(initialColor)}"
                    />
                    <input
                      type="color"
                      id="color-picker"
                      value="${
                        initialColor &&
                        /^#?[0-9a-fA-F]{6}$/.test(initialColor)
                          ? '#' + initialColor.replace('#', '')
                          : '#2563eb'
                      }"
                    />
                  </div>
                </label>
              </div>
            </div>

            <label>
              Title
              <input
                type="text"
                name="title"
                id="title-input"
                placeholder="Server announcement, update, giveaway..."
                value="${escapeHtml(initialTitle)}"
                required
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                id="description-input"
                placeholder="Main embed text. Supports new lines."
                required
              >${escapeHtml(initialDesc)}</textarea>
            </label>

            <div class="embed-preview">
              <div class="embed-title" id="preview-title">${escapeHtml(
                previewTitleText
              )}</div>
              <div class="embed-description" id="preview-description">${escapeHtml(
                previewDescText
              )}</div>
            </div>

            <div class="btn-row">
              <button type="submit" class="primary" data-action="send">
                Send as new message
              </button>
              <button
                type="submit"
                class="secondary"
                data-action="edit"
                ${canEditLast ? '' : 'disabled'}
                title="${
                  canEditLast
                    ? 'Update last sent message for this embed'
                    : 'This embed has not been sent yet'
                }"
              >
                Update last sent message
              </button>
            </div>

            <label class="switch-row" style="margin-top:10px;">
              <span>Automatically pin message after send/edit</span>
              <label class="switch">
                <input type="checkbox" name="autoPin" id="auto-pin-toggle" />
                <span class="slider"></span>
              </label>
            </label>

            <label class="switch-row">
              <span>After sending new message, clear editor for another send</span>
              <label class="switch">
                <input type="checkbox" id="send-another-toggle" checked />
                <span class="slider"></span>
              </label>
            </label>

            <div class="hint">
              • Give your embed a <strong>name</strong> to save it in the library.<br/>
              • “Update last sent message” edits the last message sent with this saved embed.<br/>
              • Channel selection is remembered automatically.
            </div>
          </form>
        </div>

        <div class="glass-card" style="margin-top:14px;">
          <label>
            Search saved embeds
            <input id="embed-search" type="text" placeholder="Name" />
          </label>
          <div class="embed-grid" id="embed-grid">
            <a href="/embeds" class="embed-card-create">
              + Create an embed!
            </a>
            ${embedCardsHtml}
          </div>
        </div>
      </section>
    `;

    const extraScript = `
      function getToast() { return window.VPANEL_TOAST || function(){}; }
      var showToast = getToast();

      var channelSelect = document.getElementById('channel-select');
      var channelSearch = document.getElementById('channel-search');
      var channelPreviewName = document.getElementById('channel-preview-name');
      var channelStorageKey = 'vp_embed_last_channel';

      function updateChannelPreview() {
        if (!channelSelect || !channelPreviewName) return;
        var opt = channelSelect.options[channelSelect.selectedIndex];
        if (opt) channelPreviewName.textContent = opt.text;
      }

      function applyChannelFilter() {
        if (!channelSelect || !channelSearch) return;
        var term = (channelSearch.value || '').toLowerCase().trim();
        Array.prototype.forEach.call(channelSelect.options, function (opt) {
          var text = (opt.textContent || '').toLowerCase();
          opt.hidden = !!term && text.indexOf(term) === -1;
        });

        var selected = channelSelect.options[channelSelect.selectedIndex];
        if (selected && selected.hidden) {
          var fallback = Array.prototype.find.call(channelSelect.options, function (opt) {
            return !opt.hidden;
          });
          if (fallback) channelSelect.value = fallback.value;
        }
        updateChannelPreview();
      }

      if (channelSelect && channelPreviewName) {
        try {
          var rememberedChannel = localStorage.getItem(channelStorageKey);
          if (rememberedChannel && channelSelect.querySelector('option[value="' + rememberedChannel + '"]')) {
            channelSelect.value = rememberedChannel;
          }
        } catch (_) {}

        channelSelect.addEventListener('change', function () {
          updateChannelPreview();
          try { localStorage.setItem(channelStorageKey, channelSelect.value || ''); } catch (_) {}
        });

        updateChannelPreview();
      }

      if (channelSearch) {
        channelSearch.addEventListener('input', applyChannelFilter);
      }

      var titleInput = document.getElementById('title-input');
      var descInput = document.getElementById('description-input');
      var previewTitle = document.getElementById('preview-title');
      var previewDesc = document.getElementById('preview-description');

      function updatePreview() {
        previewTitle.textContent = titleInput.value || 'Embed title';
        previewDesc.textContent = descInput.value || 'Embed description will appear here as you type.';
      }
      if (titleInput && descInput) {
        titleInput.addEventListener('input', updatePreview);
        descInput.addEventListener('input', updatePreview);
      }

      var searchInput = document.getElementById('embed-search');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          var term = searchInput.value.toLowerCase();
          var cards = document.querySelectorAll('.embed-card[data-name]');
          cards.forEach(function (card) {
            var nm = card.getAttribute('data-name') || '';
            card.style.display = nm.toLowerCase().includes(term) ? '' : 'none';
          });
        });
      }

      // colour sync
      var colorInput = document.getElementById('color-input');
      var colorPicker = document.getElementById('color-picker');
      function validHex(v) { return /^#?[0-9a-fA-F]{6}$/.test(v.trim()); }
      if (colorInput && colorPicker) {
        colorPicker.addEventListener('input', function () {
          colorInput.value = colorPicker.value;
        });
        colorInput.addEventListener('input', function () {
          var v = colorInput.value;
          if (validHex(v)) {
            var hex = v.trim().replace('#','');
            colorPicker.value = '#' + hex;
          }
        });
      }

      // action hidden field
      var embedForm = document.getElementById('embedForm');
      var embedActionInput = document.getElementById('embed-action');
      var embedIdInput = embedForm ? embedForm.querySelector('input[name="embedId"]') : null;
      var sendAnotherToggle = document.getElementById('send-another-toggle');
      var autoPinToggle = document.getElementById('auto-pin-toggle');
      if (embedForm && embedActionInput) {
        var submitIntent = 'send';
        var submitButtons = embedForm.querySelectorAll('button[type="submit"]');
        submitButtons.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var act = btn.getAttribute('data-action') || 'send';
            embedActionInput.value = act;
            submitIntent = act;
          });
        });

        embedForm.addEventListener('submit', function (e) {
          e.preventDefault();
          if (channelSelect) {
            try { localStorage.setItem(channelStorageKey, channelSelect.value || ''); } catch (_) {}
          }

          var formData = new FormData(embedForm);
          if (autoPinToggle && autoPinToggle.checked) {
            formData.set('autoPin', '1');
          }
          var body = new URLSearchParams(formData);
          var buttons = embedForm.querySelectorAll('button');
          buttons.forEach(function (b) { b.disabled = true; });

          fetch('/send-embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
          })
            .then(function (res) {
              return res.json().then(function (data) {
                return { ok: res.ok, data: data };
              });
            })
            .then(function (result) {
              if (result.ok) {
                if (embedIdInput && result.data && result.data.embedId) {
                  embedIdInput.value = result.data.embedId;
                }

                if (submitIntent === 'send' && sendAnotherToggle && sendAnotherToggle.checked) {
                  if (titleInput) titleInput.value = '';
                  if (descInput) descInput.value = '';
                  embedActionInput.value = 'send';
                  updatePreview();
                  if (titleInput) titleInput.focus();
                }
                showToast(result.data.message || 'Embed action completed', false);
              } else {
                showToast(result.data.message || 'Failed to send/edit embed', true);
              }
            })
            .catch(function () {
              showToast('Network error while sending embed', true);
            })
            .finally(function () {
              buttons.forEach(function (b) { b.disabled = false; });
            });
        });
      }
    `;

    res.send(renderLayout('embeds', bodyHtml, extraScript));
  } catch (err) {
    console.error('Error rendering embeds page:', err);
    res.status(500).send('Error loading embeds page. Check console.');
  }
}

// ------------------------------------------------------
// Page: Bot messages browser/editor
// ------------------------------------------------------

app.get('/bot-messages', async (req, res) => {
  try {
    return res.redirect('/embeds');

    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(500).send('GUILD_ID is not set in .env');
    }

    const guild = await client.guilds.fetch(guildId);
    await guild.channels.fetch();

    const textChannels = guild.channels.cache
      .filter(ch => ch.type === ChannelType.GuildText)
      .sort((a, b) => a.rawPosition - b.rawPosition);

    const firstChannel = textChannels.first() || null;
    const queryChannelId = toSingleString(req.query && req.query.channelId, '').trim();
    const selectedChannelId =
      (queryChannelId && textChannels.has(queryChannelId) && queryChannelId) ||
      (firstChannel && firstChannel.id) ||
      null;

    const channelOptionsHtml = textChannels
      .map(
        ch =>
          `<option value="${ch.id}" ${
            ch.id === selectedChannelId ? 'selected' : ''
          }>#${escapeHtml(ch.name)}</option>`
      )
      .join('\n');

    let botMessages = [];
    if (selectedChannelId) {
      const selectedChannel = await client.channels.fetch(selectedChannelId);
      if (selectedChannel && selectedChannel.isTextBased() && selectedChannel.messages) {
        const fetched = [];
        let beforeId = null;

        for (let i = 0; i < 4; i++) {
          const options = beforeId ? { limit: 100, before: beforeId } : { limit: 100 };
          const batch = await selectedChannel.messages.fetch(options);
          if (!batch || batch.size === 0) break;
          fetched.push(...batch.values());
          beforeId = batch.last() ? batch.last().id : null;
          if (!beforeId || batch.size < 100) break;
        }

        botMessages = fetched
          .filter(msg => msg.author.id === client.user.id)
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
          .map(msg => {
            const emb = msg.embeds[0] || null;
            const colorHex = emb && emb.hexColor ? emb.hexColor : '';
            const title = emb && emb.title ? emb.title : '';
            const description = emb && emb.description
              ? emb.description
              : (msg.content || '');

            return {
              id: msg.id,
              channelId: msg.channelId,
              jumpUrl: msg.url,
              createdAt: new Date(msg.createdTimestamp).toISOString(),
              title,
              description,
              color: colorHex,
              hasEmbed: !!emb
            };
          });
      }
    }

    const messageCardsHtml =
      botMessages.length === 0
        ? '<p class="hint">No recent bot messages found in this channel.</p>'
        : botMessages
            .map(item => {
              const payload = encodeURIComponent(
                JSON.stringify({
                  channelId: item.channelId || selectedChannelId || '',
                  messageId: item.id,
                  title: item.title || '',
                  description: item.description || '',
                  color: item.color || ''
                })
              );

              return `
                <div class="embed-card" data-payload="${payload}">
                  <div class="embed-card-title">${escapeHtml(
                    item.title || '(No embed title)'
                  )}</div>
                  <div class="embed-card-sub">ID: ${escapeHtml(item.id)} · ${
                    item.hasEmbed ? 'Embed' : 'Text'
                  }</div>
                  <div class="embed-card-footer">
                    <button class="small-btn" type="button" data-load="${escapeHtml(
                      item.id
                    )}">Load</button>
                    <a class="small-btn" href="${escapeHtml(item.jumpUrl)}" target="_blank" rel="noreferrer">Open</a>
                  </div>
                </div>
              `;
            })
            .join('\n');

    const bodyHtml = `
      <section>
        <div class="section-header">
          <h1>Bot Messages</h1>
          <small>Browse bot-sent messages and edit them as embeds.</small>
        </div>

        <div class="glass-card">
          <form method="GET" action="/bot-messages" id="botMessageChannelForm">
            <label>
              Channel
              <select name="channelId" required>
                ${channelOptionsHtml}
              </select>
            </label>
            <div class="btn-row">
              <button type="submit" class="secondary">Load bot messages</button>
            </div>
          </form>
        </div>

        <div class="glass-card" style="margin-top:14px;">
          <h2 style="margin-top:0;font-size:1rem;">Edit selected message</h2>
          <form id="editBotMessageForm">
            <input type="hidden" name="channelId" value="${escapeHtml(selectedChannelId || '')}" />
            <input type="hidden" name="messageId" id="edit-message-id" value="" />

            <label>
              Embed title
              <input type="text" name="title" id="edit-title" maxlength="256" required />
            </label>

            <label>
              Embed description
              <textarea name="description" id="edit-description" maxlength="4096" required></textarea>
            </label>

            <label>
              Color (optional)
              <div class="color-field">
                <input type="text" name="color" id="edit-color" placeholder="#2563eb" />
                <input type="color" id="edit-color-picker" value="#2563eb" />
              </div>
            </label>

            <div class="btn-row">
              <button type="submit" class="primary">Save embed to message</button>
            </div>
            <div class="hint">Only messages authored by this bot can be edited.</div>
          </form>
        </div>

        <div class="glass-card" style="margin-top:14px;">
          <label>
            Search loaded bot messages
            <input id="bot-message-search" type="text" placeholder="Title / ID" />
          </label>
          <div class="embed-grid" id="bot-message-grid">
            ${messageCardsHtml}
          </div>
        </div>
      </section>
    `;

    const extraScript = `
      function getToast() { return window.VPANEL_TOAST || function(){}; }
      var showToast = getToast();

      var searchInput = document.getElementById('bot-message-search');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          var term = searchInput.value.toLowerCase();
          var cards = document.querySelectorAll('#bot-message-grid .embed-card');
          cards.forEach(function (card) {
            var text = card.textContent.toLowerCase();
            card.style.display = text.indexOf(term) !== -1 ? '' : 'none';
          });
        });
      }

      var form = document.getElementById('editBotMessageForm');
      var messageIdInput = document.getElementById('edit-message-id');
      var channelIdInput = form ? form.querySelector('input[name="channelId"]') : null;
      var titleInput = document.getElementById('edit-title');
      var descInput = document.getElementById('edit-description');
      var colorInput = document.getElementById('edit-color');
      var colorPicker = document.getElementById('edit-color-picker');
      var activeCard = null;

      function syncColorFromText() {
        var v = (colorInput.value || '').trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
          colorPicker.value = '#' + v.replace('#', '');
        }
      }
      if (colorInput && colorPicker) {
        colorInput.addEventListener('input', syncColorFromText);
        colorPicker.addEventListener('input', function () {
          colorInput.value = colorPicker.value;
        });
      }

      var loadButtons = document.querySelectorAll('button[data-load]');
      loadButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var card = btn.closest('.embed-card');
          if (!card) return;
          activeCard = card;
          var payloadRaw = card.getAttribute('data-payload');
          if (!payloadRaw) return;

          try {
            var payload = JSON.parse(decodeURIComponent(payloadRaw));
            if (channelIdInput && payload.channelId) {
              channelIdInput.value = payload.channelId;
            }
            messageIdInput.value = payload.messageId || '';
            titleInput.value = payload.title || '';
            descInput.value = payload.description || '';
            colorInput.value = payload.color || '';
            syncColorFromText();
            showToast('Loaded message ' + (payload.messageId || ''), false);
          } catch (e) {
            showToast('Failed to parse selected message', true);
          }
        });
      });

      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!messageIdInput.value) {
            showToast('Select a bot message first (Load)', true);
            return;
          }

          var fd = new FormData(form);
          var payload = {
            channelId: fd.get('channelId'),
            messageId: fd.get('messageId'),
            title: fd.get('title'),
            description: fd.get('description'),
            color: fd.get('color')
          };

          fetch('/edit-bot-embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
            .then(function (res) {
              return res.json().then(function (data) { return { ok: res.ok, data: data }; });
            })
            .then(function (result) {
              if (!result.ok) {
                showToast(result.data.message || 'Edit failed', true);
                return;
              }

              if (activeCard) {
                var updated = {
                  messageId: payload.messageId || '',
                  title: payload.title || '',
                  description: payload.description || '',
                  color: payload.color || ''
                };
                activeCard.setAttribute('data-payload', encodeURIComponent(JSON.stringify(updated)));
                var titleEl = activeCard.querySelector('.embed-card-title');
                if (titleEl) {
                  titleEl.textContent = updated.title || '(No embed title)';
                }
              }

              showToast(result.data.message || 'Message updated', false);
            })
            .catch(function () {
              showToast('Network error while editing message', true);
            });
        });
      }
    `;

    res.send(renderLayout('botmessages', bodyHtml, extraScript));
  } catch (err) {
    console.error('Error rendering bot messages page:', err);
    res.status(500).send('Error loading bot messages page. Check console.');
  }
});

// ------------------------------------------------------
// Page: Auto Roles (new UX with chips)
// ------------------------------------------------------

app.get('/auto-roles', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(500).send('GUILD_ID is not set in .env');
    }

    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();

    const roles = guild.roles.cache
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position);

    const autoCfg = loadAutoRoles();
    const autoRoleSet = new Set(autoCfg.autoRoles || []);
    const botRoleSet = new Set(autoCfg.botRoles || []);

    const memberChipsHtml = roles
      .map(
        r => `
        <label class="role-chip">
          <input type="checkbox" name="autoRoles" value="${r.id}" ${
          autoRoleSet.has(r.id) ? 'checked' : ''
        } />
          <span>${escapeHtml(r.name)}</span>
        </label>`
      )
      .join('\n');

    const botChipsHtml = roles
      .map(
        r => `
        <label class="role-chip">
          <input type="checkbox" name="botRoles" value="${r.id}" ${
          botRoleSet.has(r.id) ? 'checked' : ''
        } />
          <span>${escapeHtml(r.name)}</span>
        </label>`
      )
      .join('\n');

    function inviteRoleOptions(roleId) {
      return roles
        .map(
          r =>
            `<option value="${r.id}" ${
              roleId === r.id ? 'selected' : ''
            }>${escapeHtml(r.name)}</option>`
        )
        .join('\n');
    }

    const inviteRowsExisting =
      autoCfg.inviteRoles && autoCfg.inviteRoles.length
        ? autoCfg.inviteRoles
            .map(
              ir => `
          <div class="invite-row">
            <div class="invite-code">
              <input type="text" name="inviteCode" value="${escapeHtml(
                ir.code
              )}" placeholder="Invite code (e.g. AbCdEf)" />
            </div>
            <div class="invite-role">
              <select name="inviteRole">
                <option value="">Select role…</option>
                ${inviteRoleOptions(ir.roleId)}
              </select>
            </div>
          </div>`
            )
            .join('\n')
        : '';

    const inviteRowBlank = `
      <div class="invite-row">
        <div class="invite-code">
          <input type="text" name="inviteCode" value="" placeholder="Invite code (e.g. AbCdEf)" />
        </div>
        <div class="invite-role">
          <select name="inviteRole">
            <option value="">Select role…</option>
            ${inviteRoleOptions(null)}
          </select>
        </div>
      </div>
    `;

    const inviteRowsHtml = inviteRowsExisting + inviteRowBlank;

    const bodyHtml = `
      <section>
        <div class="section-header">
          <h1>Auto Roles</h1>
          <small>Automatically assign roles when members or bots join.</small>
        </div>

        <div class="glass-card">
          <form method="POST" action="/auto-roles" id="autoRolesForm">
            <div class="auto-roles-top">
              <div class="auto-roles-top-text">
                Auto roles will run when someone joins your Discord server.
                <span>Use this to give basic roles like <strong>Игрок ${escapeHtml(BRAND_NAME)}</strong> automatically and avoid manual work.</span>
              </div>
              <div class="auto-roles-toggles">
                <label class="switch-row">
                  <span>Members</span>
                  <label class="switch">
                    <input type="checkbox" name="enabled" ${
                      autoCfg.enabled ? 'checked' : ''
                    } />
                    <span class="slider"></span>
                  </label>
                </label>
                <label class="switch-row">
                  <span>Bots</span>
                  <label class="switch">
                    <input type="checkbox" name="botEnabled" ${
                      autoCfg.botEnabled ? 'checked' : ''
                    } />
                    <span class="slider"></span>
                  </label>
                </label>
              </div>
            </div>

            <div class="row">
              <div>
                <div class="auto-roles-column-title">Roles for new members</div>
                <div class="hint">Tick the roles every <strong>player</strong> should receive when they join.</div>
                <div class="auto-roles-grid">
                  ${memberChipsHtml}
                </div>
              </div>

              <div>
                <div class="auto-roles-column-title">Roles for new bots</div>
                <div class="hint">Tick the roles every <strong>bot account</strong> should receive when added.</div>
                <div class="auto-roles-grid">
                  ${botChipsHtml}
                </div>
              </div>
            </div>

            <hr style="margin:18px 0;border-color:rgba(148,163,184,0.25);" />

            <label>
              Assign role to specific invite (optional)
              <div class="hint">Paste an invite code and choose which role members should receive when they join with that invite.</div>
            </label>
            <div class="invite-rows">
              ${inviteRowsHtml}
            </div>

            <div class="hint">
              If the Discord rules screen is enabled, members must accept the rules before auto roles are applied.  
              Avoid assigning administrator roles here – keep those manual.
            </div>

            <button type="submit" class="primary" style="margin-top:16px;">
              Save auto role settings
            </button>
          </form>
        </div>
      </section>
    `;

    const extraScript = `
      function getToast() { return window.VPANEL_TOAST || function(){}; }
      var showToast = getToast();

      var autoForm = document.getElementById('autoRolesForm');
      if (autoForm) {
        autoForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var fd = new FormData(autoForm);
          var body = new URLSearchParams(fd);

          fetch('/auto-roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
          })
            .then(function (res) {
              return res.json().then(function (data) {
                return { ok: res.ok, data: data };
              });
            })
            .then(function (result) {
              if (result.ok) {
                showToast(result.data.message || 'Auto roles updated', false);
              } else {
                showToast(result.data.message || 'Failed to update auto roles', true);
              }
            })
            .catch(function () {
              showToast('Network error while updating auto roles', true);
            });
        });
      }
    `;

    res.send(renderLayout('autoroles', bodyHtml, extraScript));
  } catch (err) {
    console.error('Error rendering auto-roles page:', err);
    res.status(500).send('Error loading auto-roles page. Check console.');
  }
});

// ------------------------------------------------------
// Page: Recruitment Architecture Manager
// ------------------------------------------------------

app.get('/recruitment', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(500).send('GUILD_ID is not set in .env');
    }

    const guild = await client.guilds.fetch(guildId);
    await guild.members.fetch({ limit: 1000 });

    const cfg = getGuildConfig(guild.id);
    const workflow = getRecruitmentWorkflowPolicy(guild.id);
    const templates = getRecruitmentMessageTemplates(guild.id);
    const state = getRecruitmentStateForGuild(guild.id);
    const members = guild.members.cache
      .filter(m => !m.user.bot)
      .sort((a, b) => a.user.tag.localeCompare(b.user.tag));

    const memberOptions = members
      .map(member => `<option value="${member.id}">${escapeHtml(member.user.tag)}</option>`)
      .join('\n');

    const packOptions = Object.keys(PACK_CHOICES)
      .map(value => `<option value="${value}">${escapeHtml(value)}</option>`)
      .join('\n');

    const workflowAudienceLabel = workflow.requestAudience === WORKFLOW_REQUEST_AUDIENCE_ALL
      ? 'All guild members'
      : 'Staff-only';
    const workflowVisibilityLabel = workflow.categoryVisibility === 'restricted'
      ? 'Restricted'
      : 'Public';
    const approverNamesValue = (workflow.approverRoleNames || []).join(', ');
    const approverIdsValue = (workflow.approverRoleIds || []).join(', ');

    const stateSummary = state
      ? `Category ID: ${escapeHtml(state.categoryId || '—')}<br/>Announcement Channel ID: ${escapeHtml(state.announcementChannelId || '—')}<br/>Role Requests Channel ID: ${escapeHtml(state.roleRequestsChannelId || '—')}<br/>Approvals Channel ID: ${escapeHtml(state.approvalsChannelId || '—')}<br/>Last Updated: ${escapeHtml(state.updatedAt || '—')}`
      : 'No setup state found yet. Run setup once.';

    const bodyHtml = `
      <section>
        <div class="section-header">
          <h1>Recruitment Architecture Manager</h1>
          <small>Control recruitment roles/channels directly from WebUI.</small>
        </div>

        <div class="glass-card">
          <h2 style="margin-top:0;font-size:1rem;">Current Config Snapshot</h2>
          <div class="hint">Category: <strong>${escapeHtml(cfg.categoryName || '—')}</strong></div>
          <div class="hint">Feed channel: <strong>${escapeHtml(cfg.channels && cfg.channels.feed ? cfg.channels.feed : '—')}</strong></div>
          <div class="hint">Questions slowmode: <strong>${escapeHtml(String(cfg.questionsSlowmodeSec || 60))}s</strong></div>
          <div class="hint" style="margin-top:10px;">${stateSummary}</div>

          <form id="recruitmentSnapshotForm" style="margin-top:12px;">
            <label>
              Source category ID
              <input type="text" name="categoryId" value="${escapeHtml((state && state.categoryId) || '')}" placeholder="1477126166908506186" />
            </label>
            <div class="btn-row">
              <button type="submit" class="secondary">Use current structure as default</button>
            </div>
            <div class="hint">Updates config defaults for future Setup/Repair only. Does not run setup.</div>
          </form>
        </div>

        <div class="glass-card" style="margin-top:14px;">
          <h2 style="margin-top:0;font-size:1rem;">Setup / Repair Recruitment Structure</h2>
          <form id="recruitmentSetupForm">
            <label class="switch-row">
              <span>Dry run (preview only)</span>
              <label class="switch">
                <input type="checkbox" name="dryRun" />
                <span class="slider"></span>
              </label>
            </label>

            <div class="btn-row">
              <button type="submit" class="primary">Run setup</button>
            </div>
            <div class="hint">Idempotent: running multiple times converges to the same state.</div>
          </form>
        </div>

        <div class="glass-card" style="margin-top:14px;">
          <h2 style="margin-top:0;font-size:1rem;">Assign / Remove Pack</h2>
          <form id="packForm">
            <div class="row">
              <div>
                <label>
                  Search user
                  <input type="text" id="packUserSearch" placeholder="Type username#0000" />
                </label>
                <label>
                  User
                  <select name="userId" required>
                    <option value="">Select user…</option>
                    ${memberOptions}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Pack
                  <select name="pack" required>
                    ${packOptions}
                  </select>
                </label>
              </div>
            </div>

            <div class="btn-row">
              <button type="button" class="primary" data-mode="add">Assign pack</button>
              <button type="button" class="secondary" data-mode="remove">Remove pack</button>
            </div>
          </form>
        </div>

        <div class="glass-card" style="margin-top:14px;">
          <h2 style="margin-top:0;font-size:1rem;">Role Request Workflow Policy</h2>
          <div class="hint">Current audience: <strong>${escapeHtml(workflowAudienceLabel)}</strong></div>
          <div class="hint">Category visibility: <strong>${escapeHtml(workflowVisibilityLabel)}</strong></div>
          <div class="hint">Approvers (names): <strong>${escapeHtml(approverNamesValue || '—')}</strong></div>

          <form id="recruitmentPolicyForm" style="margin-top:12px;">
            <label>
              Request audience
              <select name="requestAudience">
                <option value="all_members" ${workflow.requestAudience === 'all_members' ? 'selected' : ''}>All guild members</option>
                <option value="staff_only" ${workflow.requestAudience === 'staff_only' ? 'selected' : ''}>Staff only (leader/deputy/admin/member base)</option>
              </select>
            </label>

            <label>
              Category visibility
              <select name="categoryVisibility">
                <option value="public" ${workflow.categoryVisibility === 'public' ? 'selected' : ''}>Public</option>
                <option value="restricted" ${workflow.categoryVisibility === 'restricted' ? 'selected' : ''}>Restricted</option>
              </select>
            </label>

            <label>
              Approver role names (comma-separated)
              <input type="text" name="approverRoleNames" value="${escapeHtml(approverNamesValue)}" placeholder="P| Admin (Full), P| Admin (Mod), Модератор Discord" />
            </label>

            <label>
              Approver role IDs (comma-separated, optional)
              <input type="text" name="approverRoleIds" value="${escapeHtml(approverIdsValue)}" placeholder="123..., 456..." />
            </label>

            <label class="switch-row">
              <span>Apply setup after save</span>
              <label class="switch">
                <input type="checkbox" name="applySetup" checked />
                <span class="slider"></span>
              </label>
            </label>

            <div class="btn-row">
              <button type="submit" class="primary">Save policy</button>
            </div>
          </form>
        </div>

        <div class="glass-card" style="margin-top:14px;">
          <h2 style="margin-top:0;font-size:1rem;">Role Request Panel</h2>
          <div class="hint">Requests channel: <strong>#${escapeHtml((cfg.channels && cfg.channels.roleRequests) || ROLE_REQUESTS_FALLBACK_CHANNEL)}</strong></div>
          <div class="hint">Approvals channel: <strong>#${escapeHtml((cfg.channels && cfg.channels.approvals) || ROLE_APPROVALS_FALLBACK_CHANNEL)}</strong></div>
          <div class="hint" style="margin-top:6px;">Panel message ID: <strong>${escapeHtml((state && state.roleRequestPanelMessageId) || '—')}</strong></div>

          <form id="panelSettingsForm" style="margin-top:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label style="margin-top:0;">Button 1 — Leader label
                  <input type="text" name="label_leader" value="${escapeHtml((state && state.roleRequestButtonLabels && state.roleRequestButtonLabels.leader_recruitment) || ROLE_REQUEST_PACK_LABELS.leader_recruitment)}" placeholder="Лидер" />
                </label>
                <label>Button 1 — Description
                  <input type="text" name="desc_leader" value="${escapeHtml((state && state.roleRequestButtonDescriptions && state.roleRequestButtonDescriptions.leader_recruitment) || ROLE_REQUEST_PACK_DESCRIPTIONS_DEFAULT.leader_recruitment)}" placeholder="руководство подразделением набора" />
                </label>
              </div>
              <div>
                <label style="margin-top:0;">Button 2 — Deputy label
                  <input type="text" name="label_deputy" value="${escapeHtml((state && state.roleRequestButtonLabels && state.roleRequestButtonLabels.deputy_recruitment) || ROLE_REQUEST_PACK_LABELS.deputy_recruitment)}" placeholder="Заместитель" />
                </label>
                <label>Button 2 — Description
                  <input type="text" name="desc_deputy" value="${escapeHtml((state && state.roleRequestButtonDescriptions && state.roleRequestButtonDescriptions.deputy_recruitment) || ROLE_REQUEST_PACK_DESCRIPTIONS_DEFAULT.deputy_recruitment)}" placeholder="помощник лидера набора" />
                </label>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px;">
              <div>
                <label style="margin-top:0;">Button 3 — Member label
                  <input type="text" name="label_member" value="${escapeHtml((state && state.roleRequestButtonLabels && state.roleRequestButtonLabels.member_base) || ROLE_REQUEST_PACK_LABELS.member_base)}" placeholder="Участник" />
                </label>
                <label>Button 3 — Description
                  <input type="text" name="desc_member" value="${escapeHtml((state && state.roleRequestButtonDescriptions && state.roleRequestButtonDescriptions.member_base) || ROLE_REQUEST_PACK_DESCRIPTIONS_DEFAULT.member_base)}" placeholder="участник подразделения набора" />
                </label>
              </div>
              <div style="display:flex;align-items:flex-end;">
                <div class="btn-row" style="width:100%;">
                  <button type="submit" class="primary" style="width:100%;">Save & Resend Panel</button>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div class="glass-card" style="margin-top:14px;">
          <h2 style="margin-top:0;font-size:1rem;">Шаблоны сообщений (запросы ролей)</h2>
          <div class="hint">Переменные: <strong>{requesterMention}</strong>, <strong>{targetMention}</strong>, <strong>{packLabel}</strong>, <strong>{reason}</strong>, <strong>{approverMention}</strong>, <strong>{decisionReasonLine}</strong>, <strong>{statusEmoji}</strong>, <strong>{statusPast}</strong>, <strong>{statusPastLower}</strong>.</div>
          <div class="hint">ID запроса доступен как <strong>{id}</strong>, <strong>{idShort}</strong>, <strong>{idSpoiler}</strong>. Для reply-одобрения бот добавляет скрытый маркер автоматически.</div>

          <form id="recruitmentMessagesForm" style="margin-top:12px;">
            <label>
              Ответ пользователю при создании (в #запросы-ролей)
              <textarea name="requesterCreatedReply" rows="3" placeholder="Запрос создан...">${escapeHtml(templates.requesterCreatedReply || '')}</textarea>
            </label>

            <label>
              Сообщение в канал одобрений при создании
              <textarea name="approvalsCreatedPost" rows="5" placeholder="📝 Новый запрос...">${escapeHtml(templates.approvalsCreatedPost || '')}</textarea>
            </label>

            <label>
              Сообщение в канал одобрений после решения
              <textarea name="approvalsDecisionPost" rows="4" placeholder="✅ Запрос одобрен...">${escapeHtml(templates.approvalsDecisionPost || '')}</textarea>
            </label>

            <label>
              Сообщение в #запросы-ролей после решения
              <textarea name="requestsDecisionPost" rows="4" placeholder="📣 Запрос ...">${escapeHtml(templates.requestsDecisionPost || '')}</textarea>
            </label>

            <div class="btn-row">
              <button type="submit" class="primary">Сохранить шаблоны</button>
            </div>
          </form>
        </div>
      </section>
    `;

    const extraScript = `
      function getToast() { return window.VPANEL_TOAST || function(){}; }
      var showToast = getToast();

      var setupForm = document.getElementById('recruitmentSetupForm');
      if (setupForm) {
        setupForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var fd = new FormData(setupForm);
          var payload = {
            dryRun: fd.get('dryRun') === 'on'
          };

          fetch('/recruitment/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
              if (!result.ok) {
                showToast(result.data.message || 'Setup failed', true);
                return;
              }
              showToast(result.data.message || 'Setup done', false);
              setTimeout(function () { window.location.reload(); }, 700);
            })
            .catch(function () {
              showToast('Network error during setup', true);
            });
        });
      }

      var snapshotForm = document.getElementById('recruitmentSnapshotForm');
      if (snapshotForm) {
        snapshotForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var fd = new FormData(snapshotForm);
          var categoryId = (fd.get('categoryId') || '').toString().trim();

          fetch('/recruitment/snapshot-default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryId: categoryId })
          })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
              if (!result.ok) {
                showToast(result.data.message || 'Snapshot update failed', true);
                return;
              }
              showToast(result.data.message || 'Default snapshot updated', false);
              setTimeout(function () { window.location.reload(); }, 700);
            })
            .catch(function () {
              showToast('Network error while updating default snapshot', true);
            });
        });
      }

      var policyForm = document.getElementById('recruitmentPolicyForm');
      if (policyForm) {
        policyForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var fd = new FormData(policyForm);

          fetch('/recruitment/policy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestAudience: (fd.get('requestAudience') || '').toString(),
              categoryVisibility: (fd.get('categoryVisibility') || '').toString(),
              approverRoleNames: (fd.get('approverRoleNames') || '').toString(),
              approverRoleIds: (fd.get('approverRoleIds') || '').toString(),
              applySetup: fd.get('applySetup') === 'on'
            })
          })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
              if (!result.ok) {
                showToast(result.data.message || 'Policy update failed', true);
                return;
              }
              showToast(result.data.message || 'Policy updated', false);
              setTimeout(function () { window.location.reload(); }, 700);
            })
            .catch(function () {
              showToast('Network error while updating policy', true);
            });
        });
      }

      var packForm = document.getElementById('packForm');
      var packUserSearch = document.getElementById('packUserSearch');
      if (packForm) {
        if (packUserSearch) {
          packUserSearch.addEventListener('input', function () {
            var term = (packUserSearch.value || '').toLowerCase();
            var select = packForm.querySelector('select[name="userId"]');
            if (!select) return;
            Array.prototype.forEach.call(select.options, function (option, idx) {
              if (idx === 0) return;
              var match = option.textContent.toLowerCase().indexOf(term) !== -1;
              option.hidden = !match;
            });
          });
        }

        var buttons = packForm.querySelectorAll('button[data-mode]');
        buttons.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var mode = btn.getAttribute('data-mode');
            var fd = new FormData(packForm);
            var userId = fd.get('userId');
            var pack = fd.get('pack');
            if (!userId || !pack) {
              showToast('Select user and pack first', true);
              return;
            }

            fetch('/recruitment/pack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: userId, pack: pack, mode: mode })
            })
              .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
              .then(function (result) {
                if (!result.ok) {
                  showToast(result.data.message || 'Pack operation failed', true);
                  return;
                }
                showToast(result.data.message || 'Pack updated', false);
              })
              .catch(function () {
                showToast('Network error during pack update', true);
              });
          });
        });
      }

      var messagesForm = document.getElementById('recruitmentMessagesForm');
      if (messagesForm) {
        messagesForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var fd = new FormData(messagesForm);

          fetch('/recruitment/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requesterCreatedReply: (fd.get('requesterCreatedReply') || '').toString(),
              approvalsCreatedPost: (fd.get('approvalsCreatedPost') || '').toString(),
              approvalsDecisionPost: (fd.get('approvalsDecisionPost') || '').toString(),
              requestsDecisionPost: (fd.get('requestsDecisionPost') || '').toString()
            })
          })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
              if (!result.ok) {
                showToast(result.data.message || 'Templates update failed', true);
                return;
              }
              showToast(result.data.message || 'Templates updated', false);
              setTimeout(function () { window.location.reload(); }, 700);
            })
            .catch(function () {
              showToast('Network error while updating templates', true);
            });
        });
      }

      var panelForm = document.getElementById('panelSettingsForm');
      if (panelForm) {
        panelForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var fd = new FormData(panelForm);

          fetch('/recruitment/panel-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label_leader: (fd.get('label_leader') || '').toString().trim(),
              label_deputy: (fd.get('label_deputy') || '').toString().trim(),
              label_member: (fd.get('label_member') || '').toString().trim(),
              desc_leader: (fd.get('desc_leader') || '').toString().trim(),
              desc_deputy: (fd.get('desc_deputy') || '').toString().trim(),
              desc_member: (fd.get('desc_member') || '').toString().trim()
            })
          })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
              if (!result.ok) {
                showToast(result.data.message || 'Panel update failed', true);
                return;
              }
              showToast(result.data.message || 'Panel updated', false);
              setTimeout(function () { window.location.reload(); }, 1200);
            })
            .catch(function () {
              showToast('Network error while updating panel', true);
            });
        });
      }

    `;

    res.send(renderLayout('recruitment', bodyHtml, extraScript));
  } catch (err) {
    console.error('Error rendering recruitment page:', err);
    res.status(500).send('Error loading recruitment page. Check console.');
  }
});

// ------------------------------------------------------
// API: Recruitment setup + pack assignment
// ------------------------------------------------------

app.post('/recruitment/setup', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(400).json({ ok: false, message: 'GUILD_ID not set.' });
    }

    const guild = await client.guilds.fetch(guildId);
    const dryRun = !!(req.body && req.body.dryRun);

    const result = await setupRecruitmentForGuild(
      guild,
      `webui:${req.ip || 'unknown'}`,
      { dryRun }
    );

    return res.json({
      ok: true,
      message: result.dryRun
        ? `Dry-run complete (${result.changes.length} checks).`
        : `Setup complete (${result.changes.length} changes).`,
      changes: result.changes
    });
  } catch (err) {
    console.error('Recruitment setup error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Setup failed.' });
  }
});

app.post('/recruitment/snapshot-default', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(400).json({ ok: false, message: 'GUILD_ID not set.' });
    }

    const categoryId = toSingleString(req.body && req.body.categoryId, '').trim();
    if (categoryId && !isSnowflake(categoryId)) {
      return res.status(400).json({ ok: false, message: 'Invalid category ID.' });
    }

    const guild = await client.guilds.fetch(guildId);
    const snapshot = await saveDefaultSnapshotForGuild(guild, {
      categoryId: categoryId || undefined
    });

    return res.json({
      ok: true,
      message: `Default snapshot updated from ${snapshot.categoryName} (${snapshot.categoryId}) without running setup.`
    });
  } catch (err) {
    console.error('Recruitment snapshot update error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Snapshot update failed.' });
  }
});

app.post('/recruitment/policy', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(400).json({ ok: false, message: 'GUILD_ID not set.' });
    }

    const requestAudience = toSingleString(req.body && req.body.requestAudience, '').trim();
    const categoryVisibility = toSingleString(req.body && req.body.categoryVisibility, '').trim();
    const approverRoleNames = normaliseStringArray(req.body && req.body.approverRoleNames)
      .flatMap(item => item.split(','))
      .map(item => item.trim())
      .filter(Boolean);
    const approverRoleIds = normaliseStringArray(req.body && req.body.approverRoleIds)
      .flatMap(item => item.split(','))
      .map(item => item.trim())
      .filter(Boolean);
    const applySetup = !!(req.body && req.body.applySetup);

    if (!['all_members', 'staff_only'].includes(requestAudience)) {
      return res.status(400).json({ ok: false, message: 'Invalid request audience.' });
    }

    if (!['public', 'restricted'].includes(categoryVisibility)) {
      return res.status(400).json({ ok: false, message: 'Invalid category visibility.' });
    }

    const badRoleId = approverRoleIds.find(roleId => !isSnowflake(roleId));
    if (badRoleId) {
      return res.status(400).json({ ok: false, message: `Invalid role ID in approvers: ${badRoleId}` });
    }

    const saved = saveRecruitmentWorkflowPolicy(guildId, {
      requestAudience,
      categoryVisibility,
      approverRoleNames,
      approverRoleIds
    });

    if (!applySetup) {
      return res.json({ ok: true, message: 'Workflow policy saved without setup apply.', workflow: saved });
    }

    const guild = await client.guilds.fetch(guildId);
    const result = await setupRecruitmentForGuild(
      guild,
      `webui:${req.ip || 'unknown'}:policy`,
      { dryRun: false }
    );

    return res.json({
      ok: true,
      message: `Workflow policy saved and setup applied (${result.changes.length} changes).`,
      workflow: saved,
      changes: result.changes
    });
  } catch (err) {
    console.error('Recruitment policy update error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Policy update failed.' });
  }
});

app.post('/recruitment/pack', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(400).json({ ok: false, message: 'GUILD_ID not set.' });
    }

    const userId = toSingleString(req.body && req.body.userId, '').trim();
    const pack = toSingleString(req.body && req.body.pack, '').trim();
    const modeRaw = toSingleString(req.body && req.body.mode, 'add').trim().toLowerCase();
    const mode = modeRaw === 'remove' ? 'remove' : 'add';

    if (!isSnowflake(userId)) {
      return res.status(400).json({ ok: false, message: 'Invalid user ID.' });
    }

    if (!PACK_CHOICES[pack]) {
      return res.status(400).json({ ok: false, message: 'Invalid pack choice.' });
    }

    const guild = await client.guilds.fetch(guildId);
    const result = await assignPackRoleForGuild(
      guild,
      `webui:${req.ip || 'unknown'}`,
      userId,
      pack,
      mode
    );

    return res.json({ ok: true, message: result.message, changed: !!result.changed });
  } catch (err) {
    console.error('Recruitment pack operation error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Pack operation failed.' });
  }
});

app.post('/recruitment/messages', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(400).json({ ok: false, message: 'GUILD_ID not set.' });
    }

    const patch = {
      requesterCreatedReply: toSingleString(req.body && req.body.requesterCreatedReply, ''),
      approvalsCreatedPost: toSingleString(req.body && req.body.approvalsCreatedPost, ''),
      approvalsDecisionPost: toSingleString(req.body && req.body.approvalsDecisionPost, ''),
      requestsDecisionPost: toSingleString(req.body && req.body.requestsDecisionPost, '')
    };

    const MAX_LEN = 1800;
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value !== 'string') continue;
      if (value.length > MAX_LEN) {
        return res.status(400).json({
          ok: false,
          message: `Template ${key} is too long (${value.length}). Max ${MAX_LEN} characters.`
        });
      }
    }

    const saved = saveRecruitmentMessageTemplates(guildId, patch);
    return res.json({ ok: true, message: 'Message templates saved.', templates: saved });
  } catch (err) {
    console.error('Recruitment messages update error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Templates update failed.' });
  }
});

app.post('/recruitment/role-requests', async (req, res) => {
  return res.status(410).json({
    ok: false,
    message: 'Role requests are now handled via buttons in Discord. Use the panel in #запросы-ролей.'
  });
});

app.post('/recruitment/role-requests/:requestId/decision', async (req, res) => {
  return res.status(410).json({
    ok: false,
    message: 'Role approvals are now handled via buttons in Discord. Use #одобрение-ролей.'
  });
});

// Re-send role request panel
app.post('/recruitment/resend-panel', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return res.status(400).json({ ok: false, message: 'GUILD_ID not configured.' });
    const guild = await client.guilds.fetch(guildId);
    const context = await resolveRecruitmentWorkflowContext(guild);
    if (!context.roleRequestsChannel) {
      return res.status(404).json({ ok: false, message: 'Role requests channel not found.' });
    }
    const msg = await sendRoleRequestPanel(context.roleRequestsChannel);
    saveRecruitmentStateForGuild(guildId, { roleRequestPanelMessageId: msg.id });
    return res.json({ ok: true, message: `Panel sent (ID: ${msg.id}).` });
  } catch (err) {
    console.error('Role request panel resend error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Failed to send panel.' });
  }
});

// Save panel button labels/descriptions and resend panel
app.post('/recruitment/panel-settings', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return res.status(400).json({ ok: false, message: 'GUILD_ID not configured.' });

    const body = req.body || {};
    const labels = {};
    const descriptions = {};

    // Validate labels — max 80 chars (Discord button label limit)
    if (body.label_leader) labels.leader_recruitment = String(body.label_leader).slice(0, 80);
    if (body.label_deputy) labels.deputy_recruitment = String(body.label_deputy).slice(0, 80);
    if (body.label_member) labels.member_base = String(body.label_member).slice(0, 80);

    if (body.desc_leader !== undefined) descriptions.leader_recruitment = String(body.desc_leader).slice(0, 200);
    if (body.desc_deputy !== undefined) descriptions.deputy_recruitment = String(body.desc_deputy).slice(0, 200);
    if (body.desc_member !== undefined) descriptions.member_base = String(body.desc_member).slice(0, 200);

    // Save to state
    saveRecruitmentStateForGuild(guildId, {
      roleRequestButtonLabels: labels,
      roleRequestButtonDescriptions: descriptions
    });

    // Try to delete old panel and send new one
    const guild = await client.guilds.fetch(guildId);
    const context = await resolveRecruitmentWorkflowContext(guild);
    if (context.roleRequestsChannel) {
      const state = getRecruitmentStateForGuild(guildId) || {};
      if (state.roleRequestPanelMessageId) {
        try {
          const oldMsg = await context.roleRequestsChannel.messages.fetch(state.roleRequestPanelMessageId);
          if (oldMsg) await oldMsg.delete();
        } catch { /* already gone */ }
      }
      const msg = await sendRoleRequestPanel(context.roleRequestsChannel);
      saveRecruitmentStateForGuild(guildId, { roleRequestPanelMessageId: msg.id });
      return res.json({ ok: true, message: `Settings saved. Panel resent (ID: ${msg.id}).` });
    }

    return res.json({ ok: true, message: 'Settings saved. Could not find channel to resend panel.' });
  } catch (err) {
    console.error('Panel settings save error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Failed to save panel settings.' });
  }
});

// Get role requests list (read-only dashboard)
app.get('/recruitment/role-requests-list', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return res.status(400).json({ ok: false, message: 'GUILD_ID not configured.' });

    const statusFilter = req.query.status || 'all';
    const { list } = getRoleRequestsForGuild(guildId);

    let filtered;
    if (statusFilter === 'all') {
      filtered = [...list].reverse();
    } else {
      filtered = list.filter(r => r.status === statusFilter).reverse();
    }

    return res.json({
      ok: true,
      total: filtered.length,
      requests: filtered.slice(0, 50).map(r => ({
        id: r.id,
        idShort: r.id.slice(0, 8),
        requestedByUserId: r.requestedByUserId,
        targetUserId: r.targetUserId,
        pack: r.pack,
        packLabel: getRoleRequestPackLabel(r.pack),
        reason: r.reason || '—',
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        decidedByUserId: r.decidedByUserId,
        decisionReason: r.decisionReason || ''
      }))
    });
  } catch (err) {
    console.error('Role requests list error:', err);
    return res.status(500).json({ ok: false, message: err.message || 'Failed to load requests.' });
  }
});

app.post('/bot-status', async (req, res) => {
  try {
    const presence = toSingleString(req.body && req.body.presence, '').trim();
    if (!presence) {
      return res.status(400).json({ ok: false, message: 'Presence text is required.' });
    }
    if (presence.length > 120) {
      return res.status(400).json({ ok: false, message: 'Presence text too long (max 120).' });
    }

    if (!client.user) {
      return res.status(503).json({ ok: false, message: 'Bot user not ready yet.' });
    }

    await client.user.setPresence({
      activities: [{ name: presence, type: 0 }],
      status: 'online'
    });

    CURRENT_BOT_PRESENCE = presence;

    const nextConfig = loadConfigFromDisk();
    nextConfig.branding = nextConfig.branding || {};
    nextConfig.branding.presence = presence;
    saveConfigToDisk(nextConfig);

    return res.json({ ok: true, message: `Bot status updated to: ${presence}` });
  } catch (err) {
    console.error('Bot status update error:', err);
    return res.status(500).json({ ok: false, message: 'Failed to update bot status.' });
  }
});

app.post('/edit-bot-embed', async (req, res) => {
  try {
    const channelId = toSingleString(req.body && req.body.channelId, '').trim();
    const messageId = toSingleString(req.body && req.body.messageId, '').trim();
    const title = toSingleString(req.body && req.body.title, '').trim();
    let description = toSingleString(req.body && req.body.description, '').trim();
    const color = toSingleString(req.body && req.body.color, '').trim();

    if (!isSnowflake(channelId)) {
      return res.status(400).json({ ok: false, message: 'Invalid channel ID.' });
    }
    if (!isSnowflake(messageId)) {
      return res.status(400).json({ ok: false, message: 'Invalid message ID.' });
    }
    if (!title) {
      return res.status(400).json({ ok: false, message: 'Title is required.' });
    }
    if (!description) {
      return res.status(400).json({ ok: false, message: 'Description is required.' });
    }
    if (title.length > 256) {
      return res.status(400).json({ ok: false, message: 'Title cannot exceed 256 characters.' });
    }
    if (description.length > 4096) {
      description = description.slice(0, 4096);
    }
    if (color && !/^#?[0-9a-fA-F]{6}$/.test(color)) {
      return res.status(400).json({ ok: false, message: 'Color must be 6-digit hex (e.g. #954aff).' });
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !channel.messages) {
      return res.status(400).json({ ok: false, message: 'Channel is not message-editable.' });
    }

    const msg = await channel.messages.fetch(messageId);
    if (!msg) {
      return res.status(404).json({ ok: false, message: 'Message not found.' });
    }

    if (msg.author.id !== client.user.id) {
      return res.status(403).json({ ok: false, message: 'Only bot-authored messages can be edited.' });
    }

    const embed = baseEmbed()
      .setTitle(title)
      .setDescription(description);

    if (color) {
      embed.setColor(parseInt(color.replace('#', ''), 16));
    }

    const editPayload = { embeds: [embed] };
    if ((!msg.embeds || msg.embeds.length === 0) && msg.content) {
      editPayload.content = '';
    }
    await msg.edit(editPayload);

    const savedEmbeds = loadEmbeds();
    const normalizedColor = color ? `#${color.replace('#', '').toLowerCase()}` : '';
    let savedChanged = false;
    for (const item of savedEmbeds) {
      if (item.lastChannelId === channelId && item.lastMessageId === messageId) {
        item.title = title;
        item.description = description;
        item.color = normalizedColor;
        item.updatedAt = new Date().toISOString();
        savedChanged = true;
      }
    }
    if (savedChanged) {
      saveEmbeds(savedEmbeds);
    }

    return res.json({
      ok: true,
      message: `Edited bot message ${messageId} in #${channel.name}.`
    });
  } catch (err) {
    console.error('Error editing bot message embed:', err);
    if (err.code === 10008) {
      return res.status(404).json({ ok: false, message: 'Message not found.' });
    }
    if (err.code === 50013) {
      return res.status(403).json({ ok: false, message: 'Bot lacks permissions to edit that message.' });
    }
    return res.status(500).json({ ok: false, message: 'Failed to edit bot message.' });
  }
});

// ------------------------------------------------------
// API: Send / edit embed
// ------------------------------------------------------

app.post('/send-embed', async (req, res) => {
  const body = req.body || {};
  let { channelId, title, description, color, embedId, name, action } = body;
  const autoPin =
    toSingleString(body.autoPin, '').trim().toLowerCase() === '1' ||
    toSingleString(body.autoPin, '').trim().toLowerCase() === 'true' ||
    toSingleString(body.autoPin, '').trim().toLowerCase() === 'on';

  // normalise inputs
  channelId = toSingleString(channelId, '').trim();
  title = Array.isArray(title)
    ? title.map(v => String(v)).join(' ')
    : toSingleString(title, '');
  description = Array.isArray(description)
    ? description.map(v => String(v)).join('\n')
    : toSingleString(description, '');
  color = toSingleString(color, '').trim();
  embedId = toSingleString(embedId, '').trim();
  name = toSingleString(name, '').trim();
  action = toSingleString(action, 'send').trim().toLowerCase();

  title = (title ?? '').toString().trim();
  description = (description ?? '').toString().trim();

  if (action !== 'send' && action !== 'edit') {
    return res.status(400).json({ ok: false, message: 'Invalid action.' });
  }

  if (embedId && embedId.length > 100) {
    return res.status(400).json({ ok: false, message: 'Embed ID is invalid.' });
  }

  if (name && name.length > 100) {
    return res.status(400).json({ ok: false, message: 'Name cannot exceed 100 characters.' });
  }

  if (!channelId && action !== 'edit') {
    return res.status(400).json({ ok: false, message: 'Channel is required.' });
  }

  if (channelId && !isSnowflake(channelId)) {
    return res.status(400).json({ ok: false, message: 'Channel ID format is invalid.' });
  }

  // Validation
  if (!title || title.length === 0) {
    return res.status(400).json({ ok: false, message: 'Title is required.' });
  }

  if (!description || description.length === 0) {
    return res.status(400).json({ ok: false, message: 'Description is required.' });
  }

  if (title.length > 256) {
    return res.status(400).json({ ok: false, message: 'Title cannot exceed 256 characters.' });
  }

  // Discord description limit
  if (description.length > 4096) {
    description = description.slice(0, 4096);
  }

  // load & resolve record
  let embeds = loadEmbeds();
  let record = null;

  if (embedId) {
    record = embeds.find(e => e.id === embedId) || null;
  }

  if (!record && name && name.trim()) {
    record = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name: name.trim(),
      title: '',
      description: '',
      color: '',
      lastChannelId: null,
      lastMessageId: null,
      updatedAt: null
    };
    embeds.push(record);
  }

  const embed = baseEmbed()
    .setTitle(title.trim())
    .setDescription(description.trim());

  if (color && /^#?[0-9a-fA-F]{6}$/.test(color)) {
    const hex = color.replace('#', '');
    embed.setColor(parseInt(hex, 16));
  } else if (color) {
    return res.status(400).json({ ok: false, message: 'Color must be 6-digit hex (e.g. #954aff).' });
  }

  try {
    let channel;
    let message;
    let mode = 'send';
    let pinNote = '';

    if (
      action === 'edit' &&
      record &&
      record.lastChannelId &&
      record.lastMessageId
    ) {
      mode = 'edit';
      channel = await client.channels.fetch(record.lastChannelId);
      message = await channel.messages.fetch(record.lastMessageId);
      await message.edit({ embeds: [embed] });
    } else {
      if (!channelId) {
        return res
          .status(400)
          .json({ ok: false, message: 'Channel is required.' });
      }
      channel = await client.channels.fetch(channelId);
      message = await channel.send({ embeds: [embed] });

      if (record) {
        record.lastChannelId = message.channelId;
        record.lastMessageId = message.id;
      }
    }

    if (autoPin && message && typeof message.pin === 'function') {
      try {
        if (!message.pinned) {
          await message.pin('Auto pin from Embed Messages UI');
          pinNote = ' Message pinned.';
        } else {
          pinNote = ' Message already pinned.';
        }
      } catch (pinErr) {
        pinNote = ' Sent, but pin failed (check Manage Messages permission).';
        console.warn('Auto-pin failed for embed message:', pinErr && pinErr.message ? pinErr.message : pinErr);
      }
    }

    if (record) {
      record.name = name && name.trim() ? name.trim() : record.name;
      record.title = title.trim();
      record.description = description.trim();
      record.color = color || '';
      record.updatedAt = new Date().toISOString();
      saveEmbeds(embeds);
    }

    const channelName =
      channel && channel.name ? `#${channel.name}` : 'selected channel';

    return res.json({
      ok: true,
      mode,
      message:
        mode === 'edit'
          ? `Embed updated in ${channelName}.${pinNote}`
          : `Embed sent to ${channelName}.${pinNote}`,
      embedId: record ? record.id : null
    });
  } catch (err) {
    console.error('Error sending/editing embed:', err);
    
    // More specific error messages
    if (err.code === 50001) {
      return res.status(403).json({ ok: false, message: 'Bot missing access to that channel.' });
    }
    if (err.code === 50013) {
      return res.status(403).json({ ok: false, message: 'Bot missing permissions to send messages in that channel.' });
    }
    if (err.code === 10003) {
      return res.status(404).json({ ok: false, message: 'Channel not found.' });
    }
    
    return res.status(500).json({
      ok: false,
      message: 'Failed to send or edit embed. Check bot permissions in that channel.'
    });
  }
});

// ------------------------------------------------------
// API: Auto roles settings
// ------------------------------------------------------

app.post('/auto-roles', async (req, res) => {
  try {
    const body = req.body || {};
    const enabled = !!body.enabled;
    const botEnabled = !!body.botEnabled;

    let autoRoles = normaliseStringArray(body.autoRoles)
      .map(v => v.trim())
      .filter(isSnowflake);
    let botRoles = normaliseStringArray(body.botRoles)
      .map(v => v.trim())
      .filter(isSnowflake);

    autoRoles = [...new Set(autoRoles)].slice(0, 75);
    botRoles = [...new Set(botRoles)].slice(0, 75);

    let inviteCodes = normaliseStringArray(body.inviteCode).map(v => v.trim());
    let inviteRoles = normaliseStringArray(body.inviteRole).map(v => v.trim());

    if (inviteCodes.length > 100 || inviteRoles.length > 100) {
      return res.status(400).json({ ok: false, message: 'Too many invite-role entries.' });
    }

    const inviteEntries = [];
    for (let i = 0; i < inviteCodes.length; i++) {
      const code = (inviteCodes[i] || '').trim();
      const roleId = inviteRoles[i] || '';
      if (!code || !roleId) continue;
      if (!isInviteCode(code)) {
        return res.status(400).json({ ok: false, message: `Invalid invite code: ${code}` });
      }
      if (!isSnowflake(roleId)) {
        return res.status(400).json({ ok: false, message: `Invalid role ID for invite code: ${code}` });
      }
      inviteEntries.push({ code, roleId });
    }

    const cfg = {
      enabled,
      botEnabled,
      autoRoles,
      botRoles,
      inviteRoles: inviteEntries
    };
    saveAutoRoles(cfg);

    return res.json({ ok: true, message: 'Auto role settings updated.' });
  } catch (err) {
    console.error('Error updating auto roles:', err);
    return res
      .status(500)
      .json({ ok: false, message: 'Failed to update auto roles.' });
  }
});

// ------------------------------------------------------
// API: Reset message stats
// ------------------------------------------------------

app.post('/reset-stats', async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      return res.status(400).json({ ok: false, message: 'GUILD_ID not set.' });
    }

    const messageData = loadMessages();
    messageData[guildId] = {};
    saveMessages(messageData);

    return res.json({ ok: true, message: 'All message statistics have been reset.' });
  } catch (err) {
    console.error('Error resetting stats:', err);
    return res.status(500).json({ ok: false, message: 'Failed to reset stats.' });
  }
});

// ------------------------------------------------------
// Start web panel + Discord client
// ------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`🌐 Web panel running at http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  try {
    await flushMessagesToDisk();
  } catch {
    // ignore
  }

  try {
    await client.destroy();
  } catch {
    // ignore
  }

  try {
    await new Promise(resolve => server.close(() => resolve()));
  } catch {
    // ignore
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

client.login(process.env.DISCORD_TOKEN);
