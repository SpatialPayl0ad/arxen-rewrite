# Arxen Rewrite

Giving every message a second draft.

## What it does

Arxen Rewrite watches selected Discord channels, replaces configured words or phrases, deletes the original message, and reposts the rewritten text through a temporary webhook using the member's display name and avatar.

It also supports a separate blocked-word list. Messages containing blocked terms are deleted rather than reposted.

## Excel dictionary

Use one workbook with two sheets:

### Replacements

| Original Term | Replace With |
|---|---|
| BPC-157 | BeePeeC BPC |
| BeePeeC Wolverine | W0lver1ne |
| TB-500 | TeeBee500 |
| TB4 | TeeBee4 |

### Blocked Words

| Blocked Word | Reason |
|---|---|
| example | Optional administrator note |

Column-name variations such as `Original`, `To be replaced`, `Replacement`, `Blocked Term`, and `Notes` are accepted.

## Commands

- `/rewrite setup` — enables Rewrite in the current channel and creates the log channel if possible.
- `/rewrite enable`
- `/rewrite disable`
- `/rewrite status`
- `/rewrite template` — downloads a blank workbook.
- `/rewrite import file:<xlsx>` — replaces the current dictionary with the workbook contents.
- `/rewrite export` — downloads the active dictionary.
- `/rewrite channel target:<channel> enabled:<true|false>`
- `/rewrite test text:<message>`

Commands require **Manage Server**.

## Discord application setup

Enable the **Message Content Intent** in the Discord Developer Portal.

Recommended bot permissions:

- View Channels
- Send Messages
- Read Message History
- Manage Messages
- Manage Webhooks
- Manage Channels (optional, only for automatic log-channel creation)
- Attach Files

## Railway variables

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_test_server_id
DATA_DIR=/data
REWRITE_LOG_CHANNEL=arxen-rewrite-logs
```

Mount a Railway volume at `/data` so dictionaries and server settings survive redeployments.

## Notes

- Replacement matching is case-insensitive and whole-term aware.
- Capitalization is preserved for lowercase, uppercase, and title-case matches.
- Longer replacement terms are applied first.
- Bots and webhook messages are ignored to prevent loops.
- Mentions are not re-pinged by rewritten webhook messages.
