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

const { version: VERSION } = require('./package.json');
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DEV_GUILD_ID = process.env.DEV_GUILD_ID || '';
const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_FILE = path.join(DATA_DIR, 'arxen-rewrite.json');
const DEFAULT_LOG_CHANNEL = process.env.REWRITE_LOG_CHANNEL || 'arxen-rewrite-logs';

if (!TOKEN || !CLIENT_ID) throw new Error('DISCORD_TOKEN and CLIENT_ID are required.');
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
store.guilds ||= {};

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

function normalizeTerm(value) {
  return String(value || '').trim();
}

function findRuleIndex(cfg, original) {
  const target = normalizeTerm(original).toLocaleLowerCase();
  return cfg.replacements.findIndex(rule => normalizeTerm(rule.original).toLocaleLowerCase() === target);
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
    const original = normalizeTerm(rule.original);
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
    const term = normalizeTerm(entry.term);
    if (!term) continue;
    const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(term)}(?![\\p{L}\\p{N}_])`, 'iu');
    if (regex.test(content)) found.push(term);
  }
  return found;
}

async function findLogChannel(guild, cfg) {
  return guild.channels.cache.find(channel => channel.isTextBased() && channel.name === cfg.logChannel) || null;
}

async function logEvent(guild, cfg, text) {
  const channel = await findLogChannel(guild, cfg);
  if (channel) await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
}

function normalizeHeader(row, names) {
  for (const [key, value] of Object.entries(row)) {
    if (names.includes(String(key).trim().toLowerCase())) return String(value).trim();
  }
  return '';
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : [];
}

function detectSheet(workbook, type) {
  const preferred = type === 'replacement' ? 'replacements' : 'blocked words';
  const byName = workbook.SheetNames.find(name => name.trim().toLowerCase() === preferred);
  if (byName) return { name: byName, rows: sheetRows(workbook, byName) };

  for (const name of workbook.SheetNames) {
    const rows = sheetRows(workbook, name);
    const keys = Object.keys(rows[0] || {}).map(key => String(key).trim().toLowerCase());
    if (type === 'replacement') {
      const hasOriginal = keys.some(key => ['original term', 'original', 'to be replaced'].includes(key));
      const hasReplacement = keys.some(key => ['replacement', 'replace with', 'replacement term'].includes(key));
      if (hasOriginal && hasReplacement) return { name, rows };
    } else {
      const hasBlocked = keys.some(key => ['blocked word', 'blocked term', 'term', 'word'].includes(key));
      if (hasBlocked) return { name, rows };
    }
  }
  return null;
}

function importWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const replacementSheet = detectSheet(workbook, 'replacement');
  if (!replacementSheet) throw new Error('No replacement sheet found. Use columns named Original and Replace With.');

  const replacements = replacementSheet.rows
    .map(row => ({
      original: normalizeHeader(row, ['original term', 'original', 'to be replaced']),
      replacement: normalizeHeader(row, ['replacement', 'replace with', 'replacement term']),
    }))
    .filter(rule => rule.original && rule.replacement);

  const seen = new Set();
  const deduped = [];
  for (const rule of replacements) {
    const key = rule.original.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(rule);
  }

  const blockedSheet = detectSheet(workbook, 'blocked');
  const blockedWords = blockedSheet
    ? blockedSheet.rows.map(row => ({
        term: normalizeHeader(row, ['blocked word', 'blocked term', 'term', 'word']),
        reason: normalizeHeader(row, ['reason', 'note', 'notes']),
      })).filter(entry => entry.term)
    : [];

  return {
    replacements: deduped,
    blockedWords,
    replacementSheet: replacementSheet.name,
    blockedSheet: blockedSheet?.name || null,
  };
}

function buildWorkbook(cfg) {
  const workbook = XLSX.utils.book_new();
  const replacements = cfg.replacements.length
    ? cfg.replacements.map(rule => ({ 'Original Term': rule.original, 'Replace With': rule.replacement }))
    : [{ 'Original Term': 'BPC-157', 'Replace With': 'BeePeeC BPC' }];
  const blocked = cfg.blockedWords.length
    ? cfg.blockedWords.map(entry => ({ 'Blocked Word': entry.term, Reason: entry.reason || '' }))
    : [{ 'Blocked Word': 'example', Reason: 'Example only - delete this row' }];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(replacements), 'Replacements');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(blocked), 'Blocked Words');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function formatRule(rule, index = null) {
  const prefix = index === null ? '' : `${index}. `;
  return `${prefix}\`${rule.original}\` → \`${rule.replacement}\``;
}

const rewriteCommand = new SlashCommandBuilder()
  .setName('rewrite')
  .setDescription('Manage Arxen Rewrite')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => sub.setName('setup').setDescription('Enable Rewrite in the current channel'))
  .addSubcommand(sub => sub.setName('enable').setDescription('Enable rewriting'))
  .addSubcommand(sub => sub.setName('disable').setDescription('Disable rewriting'))
  .addSubcommand(sub => sub.setName('status').setDescription('Show configuration status'))
  .addSubcommand(sub => sub.setName('template').setDescription('Download the Excel dictionary template'))
  .addSubcommand(sub => sub.setName('export').setDescription('Export the current Excel dictionary'))
  .addSubcommand(sub => sub.setName('import').setDescription('Replace the local dictionary from an Excel workbook')
    .addAttachmentOption(option => option.setName('file').setDescription('Excel .xlsx file').setRequired(true)))
  .addSubcommand(sub => sub.setName('channel').setDescription('Enable or disable rewriting in a channel')
    .addChannelOption(option => option.setName('target').setDescription('Channel').setRequired(true))
    .addBooleanOption(option => option.setName('enabled').setDescription('Enable in this channel').setRequired(true)))
  .addSubcommand(sub => sub.setName('test').setDescription('Preview a rewrite without posting it')
    .addStringOption(option => option.setName('text').setDescription('Text to test').setRequired(true)))
  .addSubcommand(sub => sub.setName('add').setDescription('Add a server-local replacement')
    .addStringOption(option => option.setName('original').setDescription('Word or phrase to replace').setRequired(true).setMaxLength(200))
    .addStringOption(option => option.setName('replacement').setDescription('Replacement text').setRequired(true).setMaxLength(200)))
  .addSubcommand(sub => sub.setName('edit').setDescription('Edit an existing server-local replacement')
    .addStringOption(option => option.setName('original').setDescription('Existing word or phrase').setRequired(true).setMaxLength(200))
    .addStringOption(option => option.setName('replacement').setDescription('New replacement text').setRequired(true).setMaxLength(200)))
  .addSubcommand(sub => sub.setName('remove').setDescription('Remove a server-local replacement')
    .addStringOption(option => option.setName('original').setDescription('Word or phrase to remove').setRequired(true).setMaxLength(200)))
  .addSubcommand(sub => sub.setName('find').setDescription('Find matching replacement rules')
    .addStringOption(option => option.setName('term').setDescription('Search originals or replacements').setRequired(true).setMaxLength(200)))
  .addSubcommand(sub => sub.setName('list').setDescription('List server-local replacement rules')
    .addIntegerOption(option => option.setName('page').setDescription('Page number').setMinValue(1)));

const commands = [rewriteCommand.toJSON()];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

client.once('ready', async () => {
  console.log(`Arxen Rewrite v${VERSION} logged in as ${client.user.tag}`);
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
      await logEvent(interaction.guild, cfg, `⚙️ ${interaction.user.tag} enabled Rewrite in <#${interaction.channelId}>.`);
      return interaction.reply({ content: `Arxen Rewrite is enabled in <#${interaction.channelId}>.`, ephemeral: true });
    }

    if (sub === 'enable' || sub === 'disable') {
      cfg.enabled = sub === 'enable';
      saveStore();
      await logEvent(interaction.guild, cfg, `⚙️ ${interaction.user.tag} ${cfg.enabled ? 'enabled' : 'disabled'} Rewrite.`);
      return interaction.reply({ content: `Arxen Rewrite is now **${cfg.enabled ? 'enabled' : 'disabled'}**.`, ephemeral: true });
    }

    if (sub === 'status') {
      return interaction.reply({
        content: `**Arxen Rewrite v${VERSION}**\nEnabled: ${cfg.enabled}\nChannels: ${cfg.channels.length}\nReplacement rules: ${cfg.replacements.length}\nBlocked terms: ${cfg.blockedWords.length}\nLog channel: #${cfg.logChannel}\nStorage: ${DATA_FILE}`,
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
      if (!parsed.replacements.length) return interaction.editReply(`No complete replacement rows were found in **${parsed.replacementSheet}**. Nothing was changed.`);
      cfg.replacements = parsed.replacements;
      cfg.blockedWords = parsed.blockedWords;
      saveStore();
      await logEvent(interaction.guild, cfg, `📥 ${interaction.user.tag} imported ${parsed.replacements.length} replacements and ${parsed.blockedWords.length} blocked terms.`);
      return interaction.editReply(`Imported **${parsed.replacements.length}** replacements from **${parsed.replacementSheet}** and **${parsed.blockedWords.length}** blocked terms${parsed.blockedSheet ? ` from **${parsed.blockedSheet}**` : ''}.`);
    }

    if (sub === 'channel') {
      const target = interaction.options.getChannel('target', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      cfg.channels = cfg.channels.filter(id => id !== target.id);
      if (enabled) cfg.channels.push(target.id);
      saveStore();
      await logEvent(interaction.guild, cfg, `⚙️ ${interaction.user.tag} ${enabled ? 'enabled' : 'disabled'} Rewrite in ${target}.`);
      return interaction.reply({ content: `Rewriting ${enabled ? 'enabled' : 'disabled'} in ${target}.`, ephemeral: true });
    }

    if (sub === 'test') {
      const input = interaction.options.getString('text', true);
      const blocked = findBlocked(input, cfg);
      const result = applyReplacements(input, cfg);
      return interaction.reply({ content: `**Original**\n${input}\n\n**Result**\n${result.output}\n\nMatches: ${result.count}\nBlocked: ${blocked.length ? blocked.join(', ') : 'none'}`, ephemeral: true });
    }

    if (sub === 'add') {
      const original = normalizeTerm(interaction.options.getString('original', true));
      const replacement = normalizeTerm(interaction.options.getString('replacement', true));
      if (!original || !replacement) return interaction.reply({ content: 'Original and replacement text cannot be blank.', ephemeral: true });
      const existingIndex = findRuleIndex(cfg, original);
      if (existingIndex >= 0) return interaction.reply({ content: `A rule already exists: ${formatRule(cfg.replacements[existingIndex])}\nUse \`/rewrite edit\` to change it.`, ephemeral: true });
      cfg.replacements.push({ original, replacement });
      saveStore();
      await logEvent(interaction.guild, cfg, `➕ ${interaction.user.tag} added replacement: ${original} → ${replacement}`);
      return interaction.reply({ content: `Added replacement:\n${formatRule({ original, replacement })}\n\nActive rules: **${cfg.replacements.length}**`, ephemeral: true });
    }

    if (sub === 'edit') {
      const original = normalizeTerm(interaction.options.getString('original', true));
      const replacement = normalizeTerm(interaction.options.getString('replacement', true));
      const index = findRuleIndex(cfg, original);
      if (index < 0) return interaction.reply({ content: `No replacement rule was found for \`${original}\`.`, ephemeral: true });
      const previous = cfg.replacements[index].replacement;
      cfg.replacements[index] = { original: cfg.replacements[index].original, replacement };
      saveStore();
      await logEvent(interaction.guild, cfg, `✏️ ${interaction.user.tag} edited replacement: ${original} | ${previous} → ${replacement}`);
      return interaction.reply({ content: `Updated replacement:\n\`${cfg.replacements[index].original}\`: \`${previous}\` → \`${replacement}\``, ephemeral: true });
    }

    if (sub === 'remove') {
      const original = normalizeTerm(interaction.options.getString('original', true));
      const index = findRuleIndex(cfg, original);
      if (index < 0) return interaction.reply({ content: `No replacement rule was found for \`${original}\`.`, ephemeral: true });
      const [removed] = cfg.replacements.splice(index, 1);
      saveStore();
      await logEvent(interaction.guild, cfg, `➖ ${interaction.user.tag} removed replacement: ${removed.original} → ${removed.replacement}`);
      return interaction.reply({ content: `Removed replacement:\n${formatRule(removed)}\n\nActive rules: **${cfg.replacements.length}**`, ephemeral: true });
    }

    if (sub === 'find') {
      const rawTerm = normalizeTerm(interaction.options.getString('term', true));
      const term = rawTerm.toLocaleLowerCase();
      const matches = cfg.replacements.filter(rule => rule.original.toLocaleLowerCase().includes(term) || rule.replacement.toLocaleLowerCase().includes(term)).slice(0, 25);
      if (!matches.length) return interaction.reply({ content: `No replacement rules matched \`${rawTerm}\`.`, ephemeral: true });
      return interaction.reply({ content: `**Matches for \`${rawTerm}\` (${matches.length}${matches.length === 25 ? '+' : ''})**\n${matches.map(rule => formatRule(rule)).join('\n')}`, ephemeral: true });
    }

    if (sub === 'list') {
      const pageSize = 20;
      const requestedPage = interaction.options.getInteger('page') || 1;
      const sorted = cfg.replacements.slice().sort((a, b) => a.original.localeCompare(b.original));
      const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const start = (page - 1) * pageSize;
      const rules = sorted.slice(start, start + pageSize);
      if (!rules.length) return interaction.reply({ content: 'This server has no replacement rules yet.', ephemeral: true });
      return interaction.reply({ content: `**Replacement Rules — Page ${page}/${totalPages}**\n${rules.map((rule, index) => formatRule(rule, start + index + 1)).join('\n')}\n\nTotal: **${cfg.replacements.length}**`, ephemeral: true });
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
      .then(sent => setTimeout(() => sent.delete().catch(() => null), 8000))
      .catch(() => null);
    await logEvent(message.guild, cfg, `🚫 Blocked message from ${message.author.tag} in ${message.channel}: ${blocked.join(', ')}`);
    return;
  }

  const result = applyReplacements(message.content, cfg);
  if (!result.count || result.output === message.content) return;

  try {
    const webhook = await message.channel.createWebhook({ name: 'Arxen Rewrite', reason: 'Repost rewritten messages' });
    const files = [...message.attachments.values()].map(attachment => attachment.url);
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
