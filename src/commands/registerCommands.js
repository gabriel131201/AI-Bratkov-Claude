require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { config } = require('../config');

const commands = [
  new SlashCommandBuilder().setName('health').setDescription('Verifica starea botului si a configuratiei.'),
  new SlashCommandBuilder().setName('stats').setDescription('Afiseaza statistici Pro4Kings Intelligence.'),
  new SlashCommandBuilder().setName('rulesync').setDescription('Sincronizeaza manual regulamentele oficiale.'),
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Cauta in regulamente si knowledge base.')
    .addStringOption((option) => option.setName('query').setDescription('Textul cautat').setRequired(true)),
  new SlashCommandBuilder()
    .setName('knowledge-add')
    .setDescription('Adauga manual o informatie in knowledge base.')
    .addStringOption((option) => option.setName('content').setDescription('Informatia de salvat').setRequired(true)),
  new SlashCommandBuilder()
    .setName('knowledge-disable')
    .setDescription('Dezactiveaza o informatie dupa ID.')
    .addIntegerOption((option) => option.setName('id').setDescription('ID knowledge').setRequired(true)),
  new SlashCommandBuilder()
    .setName('knowledge-list')
    .setDescription('Listeaza ultimele informatii active.')
    .addIntegerOption((option) =>
      option.setName('limit').setDescription('Numar rezultate, maxim 20').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('intrebari')
    .setDescription('Listeaza intrebarile fara raspuns documentat, pentru debug.')
    .addIntegerOption((option) =>
      option.setName('limit').setDescription('Limiteaza raportul la maximum 1000 de intrebari').setRequired(false)
    ),
  new SlashCommandBuilder().setName('reload-config').setDescription('Confirma configuratia curenta incarcata.')
].map((command) => command.toJSON());

async function registerCommands() {
  if (!config.discord.token || !config.discord.applicationId || !config.discord.guildId) {
    throw new Error('DISCORD_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID are required');
  }

  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  try {
    await rest.put(Routes.applicationGuildCommands(config.discord.applicationId, config.discord.guildId), {
      body: commands
    });
  } catch (error) {
    if (error.code === 50001 || /missing access/i.test(error.message || '')) {
      throw new Error(
        'Missing Access la inregistrarea slash commands. Verifica invite-ul botului: trebuie sa aiba scope-urile bot si applications.commands, tokenul trebuie sa apartina aplicatiei din DISCORD_APPLICATION_ID, iar botul trebuie sa fie in guild-ul din DISCORD_GUILD_ID.'
      );
    }
    throw error;
  }

  console.log(`Registered ${commands.length} guild slash commands.`);
}

if (require.main === module) {
  registerCommands().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  commands,
  registerCommands
};
