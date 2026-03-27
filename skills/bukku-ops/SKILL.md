---
name: bukku-ops
description: Bukku accounting operations skill for OpenClaw. Use when working with Bukku contacts, quotations, invoices, delivery orders, payments, outstanding dues, customer ledger, or aging analysis. Requires Bukku production API access configured in workspace `.secrets/bukku.json`.
metadata:
  short-description: Bukku accounting operations
---

# Bukku Ops Skill

Use this skill for Bukku operational work in OpenClaw:

- contact lookup and creation
- quotation lookup and creation
- invoice lookup, update, and payment status
- delivery order lookup and creation
- payment lookup and safe payment recording
- outstanding due, aging, and customer ledger analysis

## Required setup

This skill expects the shared Bukku scripts to exist in the active workspace:

- `scripts/bukku-cli.mjs`
- `scripts/_bukku.js`
- `.secrets/bukku.json`

If they are missing, run the bundled installer:

```bash
bash ./scripts/install-bukku-openclaw-skill.sh
```

The installer asks only for:

- company subdomain
- Bukku API secret key

It then writes the Bukku secret config and installs the scripts into the target OpenClaw workspace.

## Working rules

- Prefer the Bukku CLI over ad-hoc API reasoning.
- For payment creation, prefer `record-payment-safe` or `mark-payment-from-invoice` style workflows that require explicit confirmation before commit.
- Do not perform delete, void, or refund actions unless a human explicitly extends the bundle for those actions.
- For ambiguous payment matching, show candidates and ask for approval first.

## Core commands

Contacts:

- `node ./scripts/bukku-cli.mjs find-contact "<query>"`
- `node ./scripts/bukku-cli.mjs get-contact <id>`
- `node ./scripts/bukku-cli.mjs create-contact --body-json '<json>'`

Quotes:

- `node ./scripts/bukku-cli.mjs list-quotes --query 'page_size=10'`
- `node ./scripts/bukku-cli.mjs get-quote <id-or-number>`
- `node ./scripts/bukku-cli.mjs create-quote --body-file /tmp/quote.json`
- `node ./scripts/bukku-cli.mjs update-quote <id> --body-file /tmp/quote-update.json`
- `node ./scripts/bukku-cli.mjs quote-to-invoice <quote-id-or-number>`

Invoices:

- `node ./scripts/bukku-cli.mjs list-invoices --query 'page_size=10'`
- `node ./scripts/bukku-cli.mjs get-invoice <id-or-number>`
- `node ./scripts/bukku-cli.mjs payment-status <id-or-number>`
- `node ./scripts/bukku-cli.mjs create-invoice --body-file /tmp/invoice.json`
- `node ./scripts/bukku-cli.mjs update-invoice <id> --body-file /tmp/invoice-update.json`
- `node ./scripts/bukku-cli.mjs invoice-to-delivery-order <invoice-id-or-number>`

Collections and aging:

- `node ./scripts/bukku-cli.mjs top-outstanding 5`
- `node ./scripts/bukku-cli.mjs customer-aging 10`
- `node ./scripts/bukku-cli.mjs top-outstanding-by-customer 10`
- `node ./scripts/bukku-cli.mjs aging-buckets`
- `node ./scripts/bukku-cli.mjs customer-ledger "<contact>"`

Payments:

- `node ./scripts/bukku-cli.mjs list-payments --query 'page_size=10'`
- `node ./scripts/bukku-cli.mjs get-payment <id-or-number>`
- `node ./scripts/bukku-cli.mjs record-payment-safe <invoice> --amount <amount>`
- `node ./scripts/bukku-cli.mjs create-payment --body-file /tmp/payment.json`
- `node ./scripts/bukku-cli.mjs update-payment <id> --body-file /tmp/payment-update.json`

Raw API:

- `node ./scripts/bukku-cli.mjs raw GET '/sales/invoices?page_size=5'`

## Safety-sensitive commands

For live payment creation:

```bash
node ./scripts/bukku-cli.mjs record-payment-safe IV-2600030 \
  --amount 100 \
  --commit --confirm yes
```

Without both `--commit` and `--confirm yes`, the command stays in draft mode.
