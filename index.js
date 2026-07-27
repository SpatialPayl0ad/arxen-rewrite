require('dotenv').config();

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  AttachmentBuilder,
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DEV_GUILD_ID = process.env.DEV_GUILD_ID || '';
const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_FILE = path.join(DATA_DIR, 'arxen-rewrite.json');
const DEFAULT_LOG_CHANNEL = process.env.REWRITE_LOG_CHANNEL || 'arxen-rewrite-logs';

if (!TOKEN || !CLIENT_ID) {
  throw new Error('DISCORD_TOKEN and CLIENT_ID are required.');
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultGuild = () => ({
  enabled: false,
  channels: [],
  ignoredRoles: [],
  ignoredUsers: [],
  preserveCase: true,
  logChannel: DEFAULT_LOG_CHANNEL,
  replacements: [],
  blockedWords: [],
});

let store = { guilds: {} };
try {
  if (fs.existsSync(DATA_FILE)) store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (error) {
  console.error('Failed to load data file:', error);
}

function saveStore() {
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function configFor(guildId) {
  if (!store.guilds[guildId]) {
    store.guilds[guildId] = defaultGuild();
    saveStore();
  }
  return store.guilds[guildId];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function preserveCase(source, replacement) {
  if (!source) return replacement;
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source === source.toLowerCase()) return replacement.toLowerCase();
  if (source[0] === source[0].toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
}

function applyReplacements(content, cfg) {
  let output = content;
  let count = 0;
  const rules = [...cfg.replacements].sort((a, b) => b.original.length - a.original.length);

  for (const rule of rules) {
    const original = String(rule.original || '').trim();
    const replacement = String(rule.replacement || '');
    if (!original) continue;

    const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(original)}(?![\\p{L}\\p{N}_])`, 'giu');
    output = output.replace(regex, match => {
      count += 1;
      return cfg.preserveCase ? preserveCase(match, replacement) : replacement;
    });
  }
  return { output, count };
}

function findBlocked(content, cfg) {
  const found = [];
  for (const entry of cfg.blockedWords) {
    const term = String(entry.term || '').trim();
    if (!term) continue;
    const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(term)}(?![\\p{L}\\p{N}_])`, 'iu');
    if (regex.test(content)) found.push(term);
  }
  return found;
}

async function findOrCreateLogChannel(guild, cfg) {
  let channel = guild.channels.cache.find(c => c.isTextBased() && c.name === cfg.logChannel);
  if (!channel && guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    channel = await guild.channels.create({
      name: cfg.logChannel,
      reason: 'Arxen Rewrite logging channel',
    }).catch(() => null);
  }
  return channel;
}

async function logEvent(guild, cfg, text) {
  const channel = await findOrCreateLogChannel(guild, cfg);
  if (channel) await channel.send({ content: text }).catch(() => null);
}

function rowsFromSheet(workbook, sheetName) {
  const name = workbook.SheetNames.find(n => n.toLowerCase() === sheetName.toLowerCase());
  if (!name) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' });
}

function normalizeHeader(row, names) {
  for (const [key, value] of Object.entries(row)) {
    if (names.includes(key.trim().toLowerCase())) return String(value).trim();
  }
  return '';
}

function importWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const replacementRows = rowsFromSheet(workbook, 'Replacements');
  const blockedRows = rowsFromSheet(workbook, 'Blocked Words');

  const replacements = replacementRows
    .map(row => ({
      original: normalizeHeader(row, ['original term', 'original', 'to be replaced']),
      replacement: normalizeHeader(row, ['replacement', 'replace with', 'replacement term']),
    }))
    .filter(r => r.original && r.replacement);

  const blockedWords = blockedRows
    .map(row => ({
      term: normalizeHeader(row, ['blocked word', 'blocked term', 'term', 'word']),
      reason: normalizeHeader(row, ['reason', 'note', 'notes']),
    }))
    .filter(r => r.term);

  return { replacements, blockedWords };
}

function buildWorkbook(cfg) {
  const wb = XLSX.utils.book_new();
  const replacements = cfg.replacements.length
    ? cfg.replacements.map(r => ({ 'Original Term': r.original, 'Replace With': r.replacement }))
    : [{ 'Original Term': 'BPC-157', 'Replace With': 'BeePeeC BPC' }];
  const blocked = cfg.blockedWords.length
    ? cfg.blockedWords.map(r => ({ 'Blocked Word': r.term, Reason: r.reason || '' }))
    : [{ 'Blocked Word': 'example', Reason: 'Example only - delete this row' }];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(replacements), 'Replacements');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(blocked), 'Blocked Words');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const commands = [
  new SlashCommandBuilder()
    .setName('rewrite')
    .setDescription('Manage Arxen Rewrite')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('setup').setDescription('Enable Rewrite and configure this channel'))
    .addSubcommand(s => s.setName('enable').setDescription('Enable rewriting'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable rewriting'))
    .addSubcommand(s => s.setName('status').setDescription('Show configuration status'))
    .addSubcommand(s => s.setName('template').setDescription('Download the Excel dictionary template'))
    .addSubcommand(s => s.setName('export').setDescription('Export the current Excel dictionary'))
    .addSubcommand(s => s.setName('import').setDescription('Import an Excel dictionary')
      .addAttachmentOption(o => o.setName('file').setDescription('Excel .xlsx file').setRequired(true)))
    .addSubcommand(s => s.setName('channel').setDescription('Enable or disable rewriting in a channel')
      .addChannelOption(o => o.setName('target').setDescription('Channel').setRequired(true))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable in this channel').setRequired(true)))
    .addSubcommand(s => s.setName('test').setDescription('Preview a rewrite without posting it')
      .addStringOption(o => o.setName('text').setDescription('Text to test').setRequired(true))),
].map(c => c.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', async () => {
  console.log(`Arxen Rewrite logged in as ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: 'Giving messages a second draft' }], status: 'online' });

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  if (DEV_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, DEV_GUILD_ID), { body: commands });
    console.log(`Registered development guild commands for ${DEV_GUILD_ID}`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Registered global commands for public use');
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'rewrite' || !interaction.guild) return;
  const cfg = configFor(interaction.guildId);
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === 'setup') {
      cfg.enabled = true;
      if (!cfg.channels.includes(interaction.channelId)) cfg.channels.push(interaction.channelId);
      saveStore();
      await findOrCreateLogChannel(interaction.guild, cfg);
      return interaction.reply({ content: `Arxen Rewrite is enabled in <#${interaction.channelId}>.`, ephemeral: true });
    }
    if (sub === 'enable' || sub === 'disable') {
      cfg.enabled = sub === 'enable';
      saveStore();
      return interaction.reply({ content: `Arxen Rewrite is now **${cfg.enabled ? 'enabled' : 'disabled'}**.`, ephemeral: true });
    }
    if (sub === 'status') {
      return interaction.reply({
        content: `**Arxen Rewrite v1.0.1**\nEnabled: ${cfg.enabled}\nChannels: ${cfg.channels.length}\nReplacement rules: ${cfg.replacements.length}\nBlocked terms: ${cfg.blockedWords.length}\nLog channel: #${cfg.logChannel}`,
        ephemeral: true,
      });
    }
    if (sub === 'template' || sub === 'export') {
      const buffer = buildWorkbook(sub === 'template' ? defaultGuild() : cfg);
      return interaction.reply({ files: [new AttachmentBuilder(buffer, { name: 'Arxen-Rewrite-Dictionary.xlsx' })], ephemeral: true });
    }
    if (sub === 'import') {
      await interaction.deferReply({ ephemeral: true });
      const attachment = interaction.options.getAttachment('file', true);
      if (!attachment.name.toLowerCase().endsWith('.xlsx')) return interaction.editReply('Please upload an `.xlsx` workbook.');
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const parsed = importWorkbook(Buffer.from(await response.arrayBuffer()));
      cfg.replacements = parsed.replacements;
      cfg.blockedWords = parsed.blockedWords;
      saveStore();
      return interaction.editReply(`Imported **${parsed.replacements.length}** replacements and **${parsed.blockedWords.length}** blocked terms.`);
    }
    if (sub === 'channel') {
      const target = interaction.options.getChannel('target', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      cfg.channels = cfg.channels.filter(id => id !== target.id);
      if (enabled) cfg.channels.push(target.id);
      saveStore();
      return interaction.reply({ content: `Rewriting ${enabled ? 'enabled' : 'disabled'} in ${target}.`, ephemeral: true });
    }
    if (sub === 'test') {
      const input = interaction.options.getString('text', true);
      const blocked = findBlocked(input, cfg);
      const result = applyReplacements(input, cfg);
      return interaction.reply({
        content: `**Original**\n${input}\n\n**Result**\n${result.output}\n\nMatches: ${result.count}\nBlocked: ${blocked.length ? blocked.join(', ') : 'none'}`,
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error(error);
    const message = `Arxen Rewrite error: ${error.message}`;
    if (interaction.deferred || interaction.replied) return interaction.editReply(message).catch(() => null);
    return interaction.reply({ content: message, ephemeral: true }).catch(() => null);
  }
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot || message.webhookId || !message.content) return;
  const cfg = configFor(message.guild.id);
  if (!cfg.enabled || !cfg.channels.includes(message.channel.id)) return;
  if (cfg.ignoredUsers.includes(message.author.id)) return;
  if (message.member && message.member.roles.cache.some(role => cfg.ignoredRoles.includes(role.id))) return;

  const blocked = findBlocked(message.content, cfg);
  if (blocked.length) {
    await message.delete().catch(() => null);
    await message.channel.send({ content: `${message.author}, that message contained a blocked term and was removed.` })
      .then(m => setTimeout(() => m.delete().catch(() => null), 8000))
      .catch(() => null);
    await logEvent(message.guild, cfg, `🚫 Blocked message from ${message.author.tag} in ${message.channel}: ${blocked.join(', ')}`);
    return;
  }

  const result = applyReplacements(message.content, cfg);
  if (!result.count || result.output === message.content) return;

  try {
    const webhook = await message.channel.createWebhook({
      name: 'Arxen Rewrite',
      reason: 'Repost rewritten messages',
    });

    const files = [...message.attachments.values()].map(a => a.url);
    await webhook.send({
      content: result.output,
      username: message.member?.displayName || message.author.displayName || message.author.username,
      avatarURL: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
      files,
      allowedMentions: { parse: [] },
    });
    await message.delete();
    await webhook.delete('Temporary Arxen Rewrite webhook').catch(() => null);
    await logEvent(message.guild, cfg, `✍️ Rewrote ${result.count} term(s) for ${message.author.tag} in ${message.channel}.`);
  } catch (error) {
    console.error('Rewrite failed:', error);
    await logEvent(message.guild, cfg, `⚠️ Rewrite failed in ${message.channel}: ${error.message}`);
  }
});

client.login(TOKEN);
