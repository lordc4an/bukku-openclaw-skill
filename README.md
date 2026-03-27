# Bukku OpenClaw Skill

Bukku accounting operations bundle for OpenClaw.

This bundle includes:

- `skills/bukku-ops/SKILL.md`
- `scripts/bukku-cli.mjs`
- `scripts/_bukku.js`
- `scripts/install-bukku-openclaw-skill.sh`
- `examples/bukku.example.json`

## What it does

The skill helps OpenClaw agents work with Bukku for:

- contacts
- quotations
- invoices
- delivery orders
- payments
- outstanding due analysis
- customer ledger
- aging analysis
- safe payment recording

## Install

Unzip or clone the repo, then run:

```bash
bash ./scripts/install-bukku-openclaw-skill.sh
```

The installer asks for only 2 values:

1. Bukku company subdomain
2. Bukku API secret key

It then installs the skill and scripts into the target OpenClaw workspace and writes:

```bash
~/.openclaw/workspace/.secrets/bukku.json
```

## Default target workspace

By default the installer writes to:

```bash
~/.openclaw/workspace
```

You can also pass a custom workspace path:

```bash
bash ./scripts/install-bukku-openclaw-skill.sh /path/to/openclaw/workspace
```

## Safety

- Live Bukku secrets are not stored in this repo.
- Use `examples/bukku.example.json` as reference only.
- Payment helper commands stay in draft mode unless explicitly committed.
