/**
 * One-time script: Send/update clean embed messages in all recruitment category channels.
 * Run: node scripts/update-recruitment-embeds.js
 */
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require('discord.js');

const config = require('../config.json');
const { getRecruitmentStateForGuild, saveRecruitmentStateForGuild } = require('../src/utils/recruitmentArchitectureManager');

const BRAND_COLOR = config.brandColor || 0x2b2d31;
const BRAND_NAME = (config.branding && config.branding.name) || 'VPROJECT';

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.GUILD_ID;
  if (!token || !guildId) throw new Error('DISCORD_TOKEN and GUILD_ID required in .env');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();

  const state = getRecruitmentStateForGuild(guildId);
  if (!state) throw new Error('No recruitment state found for guild.');

  const channels = {
    guide: guild.channels.cache.get(state.guideChannelId),
    feed: guild.channels.cache.get(state.announcementChannelId),
    questions: guild.channels.cache.get(state.questionsChannelId),
    roleRequests: guild.channels.cache.get(state.roleRequestsChannelId),
    approvals: guild.channels.cache.get(state.approvalsChannelId)
  };

  console.log('Channels resolved:');
  for (const [key, ch] of Object.entries(channels)) {
    console.log(`  ${key}: ${ch ? `#${ch.name} (${ch.id})` : 'NOT FOUND'}`);
  }

  // ─── #📌│как-пользоваться ───
  if (channels.guide) {
    console.log('\n--- Updating #как-пользоваться ---');

    // Delete old pinned bot messages
    await clearBotMessages(channels.guide, client.user.id);

    const rulesEmbed = new EmbedBuilder()
      .setTitle('Правила раздела набора')
      .setDescription(
        'Перед публикацией объявления ознакомьтесь с правилами ниже.\n\n' +
        '**1.** Прочитайте шаблон объявления перед публикацией.\n' +
        '**2.** В ленте объявлений запрещены оффтоп и флуд.\n' +
        '**3.** Вопросы задавайте в канале вопросов, а не в ленте.\n' +
        '**4.** Упоминайте только роль **@Набор открыт** при открытом наборе.\n' +
        '**5.** Соблюдайте формат шаблона — объявления без формата могут быть удалены.'
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: BRAND_NAME });

    const templateEmbed = new EmbedBuilder()
      .setTitle('Шаблон объявления')
      .setDescription(
        'Используйте этот формат при публикации объявления о наборе:\n\n' +
        '```\n' +
        'Подразделение: [название]\n' +
        'Требования: [описание]\n' +
        'Время набора (МСК): [например, 18:00–22:00]\n' +
        'Куда писать: [контакт или ссылка]\n' +
        'Дополнительно: [любая важная информация]\n' +
        '```\n\n' +
        'Упоминание разрешено только для роли **@Набор открыт**.'
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: BRAND_NAME });

    const navEmbed = new EmbedBuilder()
      .setTitle('Навигация по разделу')
      .setDescription(
        'Каналы этого раздела:\n\n' +
        `**Лента объявлений** — ${channels.feed ? `<#${channels.feed.id}>` : 'не найден'}\n` +
        'Публикация объявлений о наборе.\n\n' +
        `**Вопросы** — ${channels.questions ? `<#${channels.questions.id}>` : 'не найден'}\n` +
        'Задавайте вопросы по наборам здесь.\n\n' +
        `**Запросы ролей** — ${channels.roleRequests ? `<#${channels.roleRequests.id}>` : 'не найден'}\n` +
        'Подача запросов на получение роли.\n\n' +
        `**Одобрение ролей** — ${channels.approvals ? `<#${channels.approvals.id}>` : 'не найден'}\n` +
        'Канал для рассмотрения запросов (модерация).'
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: BRAND_NAME });

    const msg1 = await channels.guide.send({ embeds: [rulesEmbed] });
    await msg1.pin().catch(() => {});
    const msg2 = await channels.guide.send({ embeds: [templateEmbed] });
    await msg2.pin().catch(() => {});
    await channels.guide.send({ embeds: [navEmbed] });

    console.log('  Sent: rules, template, navigation embeds.');
  }

  // ─── #📣│лента-объявлений ───
  if (channels.feed) {
    console.log('\n--- Updating #лента-объявлений ---');

    await clearBotMessages(channels.feed, client.user.id);

    const feedInfoEmbed = new EmbedBuilder()
      .setTitle('Лента объявлений о наборе')
      .setDescription(
        'В этом канале публикуются объявления о наборе в подразделения.\n\n' +
        `Формат и правила — <#${channels.guide ? channels.guide.id : '0'}>.\n` +
        `Вопросы — <#${channels.questions ? channels.questions.id : '0'}>.\n\n` +
        'Публиковать могут лидеры и заместители набора.\n' +
        'Сообщения с неправильным форматом или упоминаниями могут быть удалены автоматически.'
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: BRAND_NAME });

    const msg = await channels.feed.send({ embeds: [feedInfoEmbed] });
    await msg.pin().catch(() => {});

    console.log('  Sent: feed info embed.');
  }

  // ─── #💬│вопросы-по-наборам ───
  if (channels.questions) {
    console.log('\n--- Updating #вопросы-по-наборам ---');

    await clearBotMessages(channels.questions, client.user.id);

    const questionsEmbed = new EmbedBuilder()
      .setTitle('Вопросы по наборам')
      .setDescription(
        'Этот канал предназначен для вопросов, связанных с набором.\n\n' +
        'Перед тем как задать вопрос:\n' +
        '— Прочитайте правила и шаблон в ' + (channels.guide ? `<#${channels.guide.id}>` : 'канале-гайде') + '.\n' +
        '— Проверьте ленту объявлений — возможно, ответ уже есть.\n\n' +
        'Пожалуйста, формулируйте вопросы чётко и по существу.\n' +
        'Slowmode: 60 секунд.'
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: BRAND_NAME });

    const msg = await channels.questions.send({ embeds: [questionsEmbed] });
    await msg.pin().catch(() => {});

    console.log('  Sent: questions info embed.');
  }

  // ─── #📝│запросы-ролей ───
  if (channels.roleRequests) {
    console.log('\n--- Updating #запросы-ролей ---');

    await clearBotMessages(channels.roleRequests, client.user.id);

    // Updated, cleaner panel embed
    const panelEmbed = new EmbedBuilder()
      .setTitle('Запросы на роли')
      .setDescription(
        'Для получения роли в разделе набора нажмите на одну из кнопок ниже.\n\n' +
        '**Доступные роли:**\n\n' +
        '**Лидер** — руководство подразделением набора\n' +
        '**Заместитель** — помощник лидера набора\n' +
        '**Участник** — участник подразделения набора\n\n' +
        'После нажатия откроется форма: укажите пользователя и причину запроса.\n' +
        'Минимальная длина причины — 10 символов.\n\n' +
        'Статус запроса будет отображён в этом канале после рассмотрения.'
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: `${BRAND_NAME} · Система запросов ролей` });

    const buttons = [
      new ButtonBuilder()
        .setCustomId('role_request_panel_leader_recruitment')
        .setLabel('Лидер')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('role_request_panel_deputy_recruitment')
        .setLabel('Заместитель')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('role_request_panel_member_base')
        .setLabel('Участник')
        .setStyle(ButtonStyle.Primary)
    ];
    const row = new ActionRowBuilder().addComponents(buttons);

    const msg = await channels.roleRequests.send({ embeds: [panelEmbed], components: [row] });

    // Update state with new panel message ID
    saveRecruitmentStateForGuild(guildId, { roleRequestPanelMessageId: msg.id });

    console.log(`  Sent: role request panel (${msg.id}).`);
  }

  // ─── #🔐│одобрение-ролей ───
  if (channels.approvals) {
    console.log('\n--- Updating #одобрение-ролей ---');

    // Don't clear — approval embeds with buttons are active.
    // Just send an info embed at the top if none exists.
    const approvalsInfoEmbed = new EmbedBuilder()
      .setTitle('Одобрение запросов на роли')
      .setDescription(
        'В этом канале отображаются запросы на назначение ролей.\n\n' +
        'Для каждого запроса доступны кнопки:\n' +
        '— **Одобрить** — роль будет автоматически выдана пользователю.\n' +
        '— **Отклонить** — откроется форма для указания причины.\n\n' +
        'Решения фиксируются и отправляются в канал запросов.\n' +
        'Запросы без решения автоматически истекают через 7 дней.'
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: `${BRAND_NAME} · Модерация` });

    await channels.approvals.send({ embeds: [approvalsInfoEmbed] });

    console.log('  Sent: approvals info embed.');
  }

  console.log('\nAll channel embeds updated.');
  await client.destroy();
}

async function clearBotMessages(channel, botUserId) {
  try {
    // Fetch recent messages (up to 50) and delete bot's own messages
    const messages = await channel.messages.fetch({ limit: 50 });
    const botMessages = messages.filter(m => m.author.id === botUserId);

    for (const [, msg] of botMessages) {
      try {
        // Unpin first if pinned
        if (msg.pinned) await msg.unpin().catch(() => {});
        await msg.delete();
      } catch (err) {
        console.error(`  Failed to delete message ${msg.id}: ${err.message}`);
      }
    }

    if (botMessages.size > 0) {
      console.log(`  Cleared ${botMessages.size} old bot messages.`);
    }
  } catch (err) {
    console.error(`  Failed to clear messages: ${err.message}`);
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exitCode = 1;
});
