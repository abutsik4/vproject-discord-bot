const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');
const { baseEmbed } = require('../../utils/embedFactory');
const config = require('../../../config.json');

const branding = config.branding || {};
const brandName = branding.name || 'VPROJECT';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Отправить embed с правилами сервера.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option
            .setName('channel')
            .setDescription('Канал для правил (если не указать — текущий).')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        ),
    async execute(interaction) {
        const channel =
            interaction.options.getChannel('channel') || interaction.channel;

        const embed = baseEmbed()
            .setTitle(`📜 Правила сервера ${brandName}`)
            .setDescription(
                [
                    '1️⃣ Уважайте друг друга, без токсика и оскорблений.',
                    '2️⃣ Запрещён спам, реклама и NSFW контент.',
                    '3️⃣ Запрещены обсуждения читов, продажа/покупка модов.',
                    `4️⃣ Следуйте правилам RP сервера ${brandName}.`,
                    '5️⃣ Администрация оставляет за собой право принимать финальное решение.'
                ].join('\n')
            );

        await channel.send({ embeds: [embed] });
        await interaction.reply({
            content: `✅ Правила отправлены в ${channel}`,
            ephemeral: true
        });
    }
};