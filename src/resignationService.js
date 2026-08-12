const { config } = require('./config');
const logger = require('./logger');

function differenceInDays(fromDate, toDate = new Date()) {
  if (!fromDate) return null;
  const elapsedMs = toDate.getTime() - fromDate.getTime();
  if (elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / 86_400_000);
}

function calculateTransferDays(daysOnServer) {
  if (daysOnServer === null || Number.isNaN(daysOnServer)) return null;

  if (daysOnServer <= 14) return 20;
  if (daysOnServer <= 21) return 10;
  return 0;
}

function formatTransferRecommendation(transferDays) {
  if (transferDays === null) return 'Zile transfer recomandate: necesita verificare manuala.';
  if (transferDays <= 0) return 'Zile transfer recomandate: 0 zile. Jucatorul nu mai primeste TRANSFER.';
  return `Zile transfer recomandate: ${transferDays} zile.`;
}

async function fetchMember(message) {
  if (message.member?.joinedAt) return message.member;
  if (!message.guild) return null;

  try {
    return await message.guild.members.fetch(message.author.id);
  } catch (error) {
    logger.warn('Could not fetch member for resignation notice', {
      userId: message.author.id,
      error: error.message
    });
    return null;
  }
}

function buildAdminMentions() {
  return config.adminRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');
}

async function handleResignationMessage(message) {
  const member = await fetchMember(message);
  const joinedAt = member?.joinedAt || null;
  const daysOnServer = differenceInDays(joinedAt);
  const transferDays = calculateTransferDays(daysOnServer);
  const adminMentions = buildAdminMentions();

  const lines = [
    adminMentions,
    `Demisie detectata pentru <@${message.author.id}>.`,
    joinedAt
      ? `Membru pe server din: ${joinedAt.toLocaleDateString('ro-RO')} (${daysOnServer} zile).`
      : 'Nu am putut citi data de intrare pe server pentru acest membru.',
    formatTransferRecommendation(transferDays),
    transferDays && transferDays > 0 ? 'Se aplica CK si TRANSFER conform perioadei.' : null,
    '',
    'Verificati demisia si aplicati transferul conform situatiei.'
  ].filter(Boolean);

  await message.channel.send({
    content: lines.join('\n'),
    allowedMentions: {
      users: [message.author.id],
      roles: config.adminRoleIds
    }
  });
}

module.exports = {
  calculateTransferDays,
  differenceInDays,
  formatTransferRecommendation,
  handleResignationMessage
};
