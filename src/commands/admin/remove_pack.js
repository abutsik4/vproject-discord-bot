const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { PACK_CHOICES, assignPackRole } = require('../../utils/recruitmentArchitectureManager');

const PACK_OPTIONS = [
  { name: 'admin_full', value: 'admin_full' },
  { name: 'admin_mod', value: 'admin_mod' },
  { name: 'dev_tech', value: 'dev_tech' },
  { name: 'leader_recruitment', value: 'leader_recruitment' },
  { name: 'deputy_recruitment', value: 'deputy_recruitment' },
  { name: 'member_base', value: 'member_base' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove_pack')
    .setDescription('Remove a permission-pack role from a user.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Target user')
        .setRequired(true)
    )
    .addStringOption(option => {
      option
        .setName('pack')
        .setDescription('Pack to remove')
        .setRequired(true);
      for (const pack of PACK_OPTIONS) {
        option.addChoices({ name: pack.name, value: pack.value });
      }
      return option;
    }),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const pack = interaction.options.getString('pack', true);

    if (!PACK_CHOICES[pack]) {
      return interaction.reply({
        content: '❌ Unknown pack choice.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await assignPackRole(interaction, {
        user,
        packChoice: pack,
        mode: 'remove'
      });
      await interaction.editReply({ content: `✅ ${result.message}` });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Failed to remove pack: ${error.message}`
      });
    }
  }
};
