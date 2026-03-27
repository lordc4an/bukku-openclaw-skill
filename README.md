# Bukku OpenClaw Skill

Bukku accounting operations bundle for OpenClaw.

Current bundle version: `v2026.03.27`

This bundle includes:

- `skills/bukku-ops/SKILL.md`
- `scripts/bukku-cli.mjs`
- `scripts/_bukku.js`
- `scripts/install-bukku-openclaw-skill.sh`
- `examples/bukku.example.json`

## What it does

The skill helps OpenClaw agents work with Bukku for:

- contacts
- products
- quotations
- invoices
- delivery orders
- payments
- outstanding due analysis
- customer ledger
- aging analysis
- safe payment recording

## Latest update

`v2026.03.27` includes:

- fixed Bukku quote creation defaults and live tenant mappings
- added product commands:
  - `list-products`
  - `find-product`
  - `resolve-product`
  - `get-product`
  - `create-product`
  - `update-product`
- added product-backed document helpers:
  - `quote-from-product`
  - `invoice-from-product`
- added automatic product enrichment for `create-quote` and `create-invoice`
- added fuzzy product matching with ambiguity guard and candidate shortlist output

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
