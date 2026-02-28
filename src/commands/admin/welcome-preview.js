const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../../utils/embedFactory');
const config = require('../../../config.json');

const branding = config.branding || {};
const brandName = branding.name || 'VPROJECT';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome-preview')
        .setDescription('Показать, как выглядит приветственное сообщение.'),
    async execute(interaction) {
        const embed = baseEmbed()
            .setTitle(`👋 Добро пожаловать на ${brandName}`)
            .setDescription(
                config.welcome ?.message ||
                `Добро пожаловать на ${brandName}! Ознакомься с правилами и присоединяйся к игре.`
            )
            .addFields({
                name: 'Приветственный канал',
                value: config.welcome ?.channelId ?
                    `<#${config.welcome.channelId}>` :
                    '❌ не настроен'
            }, {
                name: 'Авто-роли',
                value: config.welcome ?.autoRoleIds ?.length > 0 ?
                    config.welcome.autoRoleIds.map(id => `<@&${id}>`).join(', ') :
                    'нет авто-ролей'
            });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};