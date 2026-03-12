const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

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

const rest = new REST({ version: '10' }).setToken(token);

(async() => {
    try {
        console.log('Started registering application (/) commands for guild.');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId), { body: commands }
        );

        console.log(`Successfully registered ${commands.length} application (/) command(s) for guild.`);
    } catch (error) {
        console.error(error);
    }
})();