const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../../utils/embedFactory');
const config = require('../../../config.json');

const branding = config.branding || {};
const brandName = branding.name || 'VPROJECT';
const projectPhase = branding.phase || 'OBT';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription(`Список основных команд ${brandName} бота.`),
    async execute(interaction) {
        const embed = baseEmbed()
            .setTitle(`📖 ${brandName} • Команды`)
            .setDescription(`Бот сейчас в **${projectPhase}** — функционал будет расширяться.`)
            .addFields({
                name: '⚙️ Админ / управление',
                value: '`/announce`, `/rules`, `/welcome-preview`, `/settings-preview`'
            }, {
                name: '📊 Статистика',
                value: '`/leaderboard` — топ участников по активности'
            }, {
                name: '🎉 Розыгрыши',
                value: '`/giveaway-template` — шаблон GiveawayBoat-стиля'
            }, {
                name: 'ℹ️ Общее',
                value: '`/ping`, `/help`'
            }, {
                name: '🌐 Веб-панель',
                value: 'Управление ботом через браузер: настройки автоматических ролей, статистика сообщений, создание embed-объявлений.'
            });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};