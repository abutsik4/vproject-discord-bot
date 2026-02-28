const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  setupRecruitmentArchitecture
} = require('../../utils/recruitmentArchitectureManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_recruitment')
    .setDescription('Create/update recruitment architecture (roles + category + channels).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(option =>
      option
        .setName('dry_run')
        .setDescription('Validate and preview changes without writing.')
        .setRequired(false)
    ),

  async execute(interaction) {
    const dryRun = interaction.options.getBoolean('dry_run') || false;

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await setupRecruitmentArchitecture(interaction, { dryRun });
      const title = result.dryRun
        ? '✅ Recruitment setup dry-run completed'
        : '✅ Recruitment setup completed';

      const lines = result.changes.slice(0, 20).map(item => `• ${item}`);
      const extra =
        result.changes.length > 20
          ? `\n...and ${result.changes.length - 20} more changes.`
          : '';

      await interaction.editReply({
        content: `${title}\n${lines.join('\n')}${extra}`
      });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Setup failed: ${error.message}`
      });
    }
  }
};
