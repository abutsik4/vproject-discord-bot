const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');
const { baseEmbed } = require('../../utils/embedFactory');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Отправить красивое embed-объявление.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option
            .setName('channel')
            .setDescription('Канал, куда отправить объявление.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(option =>
            option
            .setName('title')
            .setDescription('Заголовок объявления.')
            .setRequired(true)
        )
        .addStringOption(option =>
            option
            .setName('text')
            .setDescription('Текст объявления.')
            .setRequired(true)
        ),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const title = interaction.options.getString('title');
        const text = interaction.options.getString('text');

        const embed = baseEmbed()
            .setTitle(`📢 ${title}`)
            .setDescription(text);

        await channel.send({ embeds: [embed] });
        await interaction.reply({
            content: `✅ Объявление отправлено в ${channel}`,
            ephemeral: true
        });
    }
};