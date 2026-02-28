const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { baseEmbed } = require('../../utils/embedFactory');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway-template')
        .setDescription('Создать embed-шаблон розыгрыша (GiveawayBoat-стиль).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option
            .setName('channel')
            .setDescription('Канал для розыгрыша.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(option =>
            option
            .setName('prize')
            .setDescription('Приз (например: VIP, донат, авто и т.д.).')
            .setRequired(true)
        )
        .addStringOption(option =>
            option
            .setName('duration')
            .setDescription('Длительность (например: 10m, 1h, 1d).')
            .setRequired(false)
        )
        .addIntegerOption(option =>
            option
            .setName('winners')
            .setDescription('Количество победителей.')
            .setRequired(false)
        ),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const prize = interaction.options.getString('prize');
        const durationRaw =
            interaction.options.getString('duration') ||
            config.giveaways.defaultDuration ||
            '1h';
        const winners =
            interaction.options.getInteger('winners') ||
            config.giveaways.defaultWinners ||
            1;

        const emoji = config.giveaways.defaultEmoji || '🎉';

        const embed = baseEmbed()
            .setTitle(`${emoji} Розыгрыш • ${prize}`)
            .setDescription(
                [
                    `Нажми на реакцию **${emoji}** чтобы участвовать.`,
                    '',
                    `⏱ Длительность: **${durationRaw}**`,
                    `🏆 Победителей: **${winners}**`,
                    '',
                    '❗ Сейчас это только шаблон — логика выбора победителей будет добавлена позже.'
                ].join('\n')
            );

        const message = await channel.send({ embeds: [embed] });
        try {
            await message.react(emoji);
        } catch (e) {
            console.warn('Не удалось добавить реакцию к розыгрышу:', e);
        }

        await interaction.reply({
            content: `✅ Шаблон розыгрыша отправлен в ${channel}`,
            ephemeral: true
        });
    }
};