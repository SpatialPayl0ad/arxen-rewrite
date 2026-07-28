# Arxen Rewrite

Giving every message a second draft.

## What it does

Arxen Rewrite watches selected Discord channels, replaces configured words or phrases, deletes the original message, and reposts the rewritten text through a temporary webhook using the member's display name and avatar.

Each Discord server has its own local dictionary. Rules can be managed live through Discord commands or replaced in bulk from Excel.

## Live replacement commands

Commands require **Manage Server**.

- `/rewrite add original:<text> replacement:<text>` — add a new local rule immediately.
- `/rewrite edit original:<text> replacement:<text>` — change an existing local rule.
- `/rewrite remove original:<text>` — remove a local rule.
- `/rewrite find term:<text>` — search original and replacement text.
- `/rewrite list page:<number>` — show 20 local rules per page.

Changes are written immediately to the guild's section of `/data/arxen-rewrite.json` and survive redeployments when a Railway volume is mounted at `/data`.

## Other commands

- `/rewrite setup` — enables Rewrite in the current channel.
- `/rewrite enable`
- `/rewrite disable`
- `/rewrite status`
- `/rewrite template` — downloads a blank workbook.
- `/rewrite import file:<xlsx>` — replaces the current local dictionary with the workbook contents.
- `/rewrite export` — downloads the active local dictionary.
- `/rewrite channel target:<channel> enabled:<true|false>`
- `/rewrite test text:<message>`

## Excel dictionary

The preferred replacement sheet name is `Replacements`, with these columns:

| Original Term | Replace With |
|---|---|
| BPC-157 | BeePeeC BPC |
| TB-500 | TeeBee500 |

The importer also detects a differently named worksheet when it contains recognized headers such as `Original`, `Original Term`, `To be replaced`, `Replacement`, `Replace With`, or `Replacement Term`.

An optional `Blocked Words` sheet may contain:

| Blocked Word | Reason |
|---|---|
| example | Optional administrator note |

Imports reject unrecognized workbooks and do not erase the active dictionary when zero complete replacement rows are found.

## Discord application setup

Enable the **Message Content Intent** in the Discord Developer Portal.

Recommended bot permissions:

- View Channels
- Send Messages
- Read Message History
- Manage Messages
- Manage Webhooks
- Attach Files

Console owns channel/category provisioning and permission repair for the Arxen deployment.

## Railway variables

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
DEV_GUILD_ID=your_test_server_id
DATA_DIR=/data
REWRITE_LOG_CHANNEL=arxen-rewrite-logs
ARXEN_CONSOLE_URL=your_console_url
ARXEN_CONSOLE_HEARTBEAT_TOKEN=shared_heartbeat_token
```

`DEV_GUILD_ID` is optional and should only be set while testing. When present, commands register immediately in that development server. When blank or removed, Rewrite registers commands globally.

Mount a Railway volume at `/data` so dictionaries and server settings survive redeployments.

## Notes

- Replacement matching is case-insensitive and whole-term aware.
- Capitalization is preserved for lowercase, uppercase, and title-case matches.
- Longer replacement terms are applied first.
- Bots and webhook messages are ignored to prevent loops.
- Mentions are not re-pinged by rewritten webhook messages.
- Live rule changes are logged to the configured Rewrite log channel when that channel is available.
