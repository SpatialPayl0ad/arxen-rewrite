# Arxen Rewrite Privacy Policy

**Effective date: July 27, 2026**

This Privacy Policy explains how **Arxen Rewrite** (the **Service**) processes information when the Discord application is installed or used.

Arxen Rewrite is a third-party Discord application and is not affiliated with or endorsed by Discord Inc. Discord separately processes information under its own terms and privacy policy.

## 1. Summary

Arxen Rewrite reads message content only where needed to provide configured rewriting and blocked-term functions. It processes matching messages, may delete the original Discord message, and may repost rewritten content through a temporary webhook.

The Service stores server configuration, replacement dictionaries, blocked-term lists, and related identifiers needed to operate. It does not sell personal information or use message content for advertising.

## 2. Information the Service processes

Depending on configuration and use, Arxen Rewrite may process the following information.

### Discord account and server information

- Discord user ID;
- username, display name, nickname, and avatar URL;
- Discord server ID;
- channel IDs and channel names;
- role IDs used for permission or ignore settings;
- command interaction information; and
- basic metadata supplied by Discord for messages and interactions.

### Message information

In channels where Arxen Rewrite is enabled, the Service may process:

- message content;
- matched replacement terms;
- matched blocked terms;
- attachment URLs and attachment metadata;
- the author and channel associated with a processing event; and
- the rewritten output needed to repost the message.

The current Service processes message content in memory to determine whether a rule matches. It does not intentionally save the full text of ordinary rewritten messages in its persistent configuration store.

A server's Discord log channel may receive an operational record identifying the author, channel, number of replacements, matched blocked terms, or an error. Those Discord messages remain subject to the server's own retention and moderation decisions and Discord's systems.

### Administrator-provided information

The Service may process and store:

- replacement dictionaries;
- blocked-term lists and notes;
- uploaded Excel dictionary files during import;
- selected Rewrite channels;
- ignored users or roles;
- log-channel settings;
- enabled or disabled status;
- installed library selections, local overrides, and disabled rules; and
- library suggestions or administrative notes submitted through supported features.

## 3. How information is used

Information is used to:

- provide word and phrase replacement features;
- detect administrator-configured blocked terms;
- delete and repost matching messages;
- preserve eligible attachments during a rewrite;
- execute slash commands and administrator requests;
- maintain per-server configuration;
- provide official or server-specific dictionaries and libraries;
- create operational logs and diagnose failures;
- prevent loops, abuse, fraud, or unauthorized administrative changes;
- maintain security and service reliability; and
- comply with legal and Discord platform requirements.

Arxen Rewrite does not use message content to build advertising profiles and does not sell personal information.

## 4. Legal bases where applicable

Where privacy law requires a legal basis, processing may rely on:

- performance of the Service requested by a user or server administrator;
- legitimate interests in operating, securing, troubleshooting, and improving the Service;
- consent where specifically requested; and
- compliance with legal obligations.

Server administrators are responsible for determining whether additional notices or consent are required in their communities.

## 5. Storage and retention

### Persistent server configuration

Per-server settings, dictionaries, blocked-term lists, channel identifiers, and related configuration may be stored on the Service's hosted persistent storage for as long as the bot remains configured for that server or until the data is deleted.

### Message content

Ordinary message content is generally processed transiently to perform a rewrite and is not intentionally retained in the persistent configuration file. Rewritten content is posted back to Discord and is then retained according to Discord and the server's own settings.

### Imported files

Uploaded dictionary workbooks are downloaded for parsing. The Service extracts the configured rules and does not intentionally retain the original uploaded workbook after the import request finishes, unless a future feature clearly states otherwise.

### Logs

Operational events may be retained:

- in Discord log channels until deleted by the server;
- in hosting-provider application logs for troubleshooting and security; and
- in backups of the Service's configuration storage for a limited operational period.

Retention periods may vary based on technical, security, backup, and legal requirements. Data no longer reasonably needed may be deleted or anonymized.

## 6. Sharing and service providers

Information may be processed by providers needed to operate the Service, including:

- **Discord**, which supplies the platform, API, messages, interactions, webhooks, and account information;
- **Railway or another hosting provider**, which may host the application, persistent storage, and operational logs;
- **GitHub**, when a person voluntarily submits an issue, suggestion, or other repository contribution; and
- technical providers used for security, monitoring, storage, or maintenance if added later.

Information may also be disclosed when reasonably necessary to:

- comply with law, legal process, or a valid government request;
- protect users, Discord communities, the Service, or the public;
- investigate abuse, fraud, security incidents, or violations; or
- complete a merger, transfer, or reorganization of the Service, subject to appropriate protections.

The Service does not sell personal information.

## 7. Server administrators and local configuration

Server administrators control where Arxen Rewrite is enabled and what dictionaries or blocked-term rules it applies. They may also control who can access Discord log channels and how long those messages remain available.

Because administrators choose these settings, questions about a specific server's use of Arxen Rewrite should first be directed to that server's administrators.

## 8. Data security

Reasonable technical and organizational measures are used to protect stored configuration and credentials. However, no online service, Discord bot, webhook, storage system, or transmission method is completely secure.

Users must never submit bot tokens, account credentials, private keys, session cookies, or sensitive backup files through public Discord channels or GitHub issues.

## 9. Your choices and rights

Depending on applicable law, you may have rights to request access, correction, deletion, restriction, objection, or portability concerning personal information associated with you.

Practical choices include:

- asking a server administrator to disable Arxen Rewrite in a channel;
- asking a server administrator to remove your user ID from a stored ignore or configuration list;
- deleting messages or log entries where server permissions allow;
- leaving a server that uses the Service; or
- requesting deletion of Service-controlled configuration associated with a server.

To make a privacy request, use the contact method below and provide enough information to identify the relevant Discord server and account. Do not post sensitive information in a public issue. Verification may be required before a request is completed.

Some information may be retained where required for security, legal compliance, dispute resolution, or protection against abuse.

## 10. Children's privacy

Arxen Rewrite is intended only for people who are permitted to use Discord. The Service is not directed to children who are below the minimum age required by Discord or applicable law, and it does not knowingly seek to collect personal information from such children.

## 11. International processing

The Service and its providers may process information in the United States or other countries. Those locations may have privacy laws different from the laws where you live. Where required, reasonable measures will be used to support lawful cross-border processing.

## 12. Changes to this Policy

This Privacy Policy may be updated as the Service changes. The effective date above will be revised when changes are published. Material changes may also be announced through the Arxen community, repository, bot documentation, or another appropriate channel.

## 13. Contact

Privacy questions or requests may be submitted through the issue tracker for the Arxen Rewrite GitHub repository:

**GitHub repository:** `SpatialPayl0ad/arxen-rewrite`

For a request involving private information, open a minimal issue asking for a private contact method rather than posting Discord IDs, message content, credentials, or other sensitive information publicly.
