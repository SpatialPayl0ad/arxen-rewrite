'use strict';

const { Client } = require('discord.js');
const originalLogin = Client.prototype.login;

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function sendHeartbeat(client) {
  if (!client.isReady()) return;
  const baseUrl = normalizeUrl(process.env.ARXEN_CONSOLE_URL || process.env.CONSOLE_URL);
  const token = process.env.ARXEN_CONSOLE_HEARTBEAT_TOKEN || process.env.CONSOLE_HEARTBEAT_TOKEN || '';
  if (!baseUrl || !token) return;

  const guildIds = [...client.guilds.cache.keys()].filter((id) => /^\d{17,20}$/.test(id));
  const response = await fetch(`${baseUrl}/heartbeat`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      botKey: 'rewrite',
      name: 'Arxen Rewrite',
      service: 'Message Rewriting / Curated Dictionaries',
      version: require('./package.json').version,
      status: 'online',
      activity: 'Giving messages a second draft',
      activityByGuild: Object.fromEntries(guildIds.map((guildId) => [guildId, 'Giving messages a second draft'])),
      botUserId: client.user?.id || null,
      botTag: client.user?.tag || null,
      avatarUrl: client.user?.displayAvatarURL?.({ size: 128 }) || null,
      guildCount: guildIds.length,
      guildIds,
      order: 55,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Console heartbeat failed: ${response.status} ${body}`.slice(0, 500));
  }
}

Client.prototype.login = function patchedLogin(...args) {
  if (!this.__arxenRewriteHeartbeatInstalled) {
    this.__arxenRewriteHeartbeatInstalled = true;
    this.once('clientReady', () => {
      const run = () => sendHeartbeat(this).catch((error) => console.error('[Arxen Console] Rewrite heartbeat failed:', error.message));
      setTimeout(run, 2500);
      const interval = setInterval(run, positiveInt(process.env.ARXEN_CONSOLE_HEARTBEAT_SECONDS, 60) * 1000);
      interval.unref?.();
      console.log('[Arxen Console] Rewrite heartbeat reporting enabled.');
    });
  }
  return originalLogin.apply(this, args);
};
