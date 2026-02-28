const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { baseEmbed } = require('../../utils/embedFactory');
const config = require('../../../config.json');

const branding = config.branding || {};
const brandName = branding.name || 'VPROJECT';

module.exports = {
        data: new SlashCommandBuilder()
            .setName('settings-preview')
          .setDescription(`Показать текущие настройки ${brandName} бота.`)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        async execute(interaction) {
            const welcome = config.welcome || {};
            const logs = config.logs || {};
            const moderation = config.moderation || {};
            const levels = config.levels || {};
            const giveaways = config.giveaways || {};

            const embed = baseEmbed()
              .setTitle(`⚙️ ${brandName} • Настройки (Preview)`)
                .addFields({
                        name: '👋 Welcome',
                        value: [
                                `Статус: **${welcome.enabled ? 'ON' : 'OFF'}**`,
                                `Канал: ${welcome.channelId ? `<#${welcome.channelId}>` : 'не настроен'}`,
            `Авто-роли: ${
              welcome.autoRoleIds && welcome.autoRoleIds.length
                ? welcome.autoRoleIds.map(id => `<@&${id}>`).join(', ')
                : 'нет'
            }`
          ].join('\n'),
          inline: false
        },
        {
          name: '📜 Логи',
          value: [
            `Статус: **${logs.enabled ? 'ON' : 'OFF'}**`,
            `Канал логов: ${
              logs.channelId ? `<#${logs.channelId}>` : 'не настроен'
            }`
          ].join('\n'),
          inline: false
        },
        {
          name: '🛡️ Модерация',
          value: [
            `AutoMod: **${moderation.autoModEnabled ? 'ON' : 'OFF'}**`,
            `Удалять инвайты: **${
              moderation.deleteInvites ? 'ON' : 'OFF'
            }**`,
            `Фильтр капса: **${moderation.capsFilter ? 'ON' : 'OFF'}**`
          ].join('\n'),
          inline: false
        },
        {
          name: '📈 Уровни',
          value: [
            `Уровни: **${levels.enabled ? 'ON' : 'OFF'}**`,
            `Канал для level-up: ${
              levels.levelUpChannelId ? `<#${levels.levelUpChannelId}>` : 'по умолчанию'
            }`
          ].join('\n'),
          inline: false
        },
        {
          name: '🎉 Розыгрыши',
          value: [
            `Длительность по умолчанию: **${giveaways.defaultDuration || '1h'}**`,
            `Победителей по умолчанию: **${
              giveaways.defaultWinners || 1
            }**`,
            `Эмодзи: **${giveaways.defaultEmoji || '🎉'}**`
          ].join('\n'),
          inline: false
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};