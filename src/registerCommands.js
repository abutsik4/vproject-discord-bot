const { REST, Routes } = require('discord.js');
require('dotenv').config();

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

const commands = [];

const rest = new REST({ version: '10' }).setToken(token);

(async() => {
    try {
        console.log('Started clearing application (/) commands for guild.');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId), { body: commands }
        );

        console.log('Successfully cleared application (/) commands for guild.');
    } catch (error) {
        console.error(error);
    }
})();