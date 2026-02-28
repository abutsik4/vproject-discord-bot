const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

const branding = config.branding || {};
const brandName = branding.name || 'VPROJECT';

function baseEmbed() {
    const embed = new EmbedBuilder()
        .setColor(config.brandColor || 0x2b2d31)
        .setTimestamp();

    if (config.footerText || config.footerIcon) {
        embed.setFooter({
            text: config.footerText || brandName,
            iconURL: config.footerIcon || null
        });
    }

    return embed;
}

module.exports = { baseEmbed };