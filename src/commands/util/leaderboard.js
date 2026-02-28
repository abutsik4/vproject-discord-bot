const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../../utils/embedFactory');
const fs = require('node:fs');
const path = require('node:path');

const MESSAGES_FILE = path.join(__dirname, '..', '..', '..', 'data', 'messages.json');

function loadMessages() {
  try {
    if (!fs.existsSync(MESSAGES_FILE)) return {};
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Показать топ участников по количеству сообщений.')
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('Количество участников в топе (по умолчанию 10)')
        .setMinValue(1)
        .setMaxValue(25)
    ),
  async execute(interaction) {
    const limit = interaction.options.getInteger('limit') || 10;
    const guildId = interaction.guild.id;

    const messageData = loadMessages();
    const guildData = messageData[guildId] || {};

    // Convert to array and sort
    const leaderboard = Object.entries(guildData)
      .map(([userId, data]) => ({
        userId,
        username: data.username || 'Unknown',
        count: data.count || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    if (leaderboard.length === 0) {
      return interaction.reply({
        content: '❌ Пока нет данных о сообщениях. Начните общаться!',
        ephemeral: true
      });
    }

    const totalMessages = Object.values(guildData).reduce((sum, user) => sum + (user.count || 0), 0);

    const description = leaderboard
      .map((user, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        return `${medal} **${user.username}** — ${user.count.toLocaleString()} сообщений`;
      })
      .join('\n');

    const embed = baseEmbed()
      .setTitle('📊 Топ участников по активности')
      .setDescription(description)
      .addFields({
        name: '💬 Всего сообщений',
        value: totalMessages.toLocaleString(),
        inline: true
      }, {
        name: '👥 Участников',
        value: Object.keys(guildData).length.toLocaleString(),
        inline: true
      });

    await interaction.reply({ embeds: [embed] });
  }
};
