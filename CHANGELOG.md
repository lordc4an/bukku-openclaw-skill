# Changelog

## v2026.03.27

- Synced latest `bukku-cli.mjs` and `_bukku.js` from the working OpenClaw workspace.
- Fixed Bukku quotation creation defaults and valid live tenant mappings.
- Added product commands:
  - `list-products`
  - `find-product`
  - `resolve-product`
  - `get-product`
  - `create-product`
  - `update-product`
- Added product-backed document helpers:
  - `quote-from-product`
  - `invoice-from-product`
- Added automatic product enrichment for generic `create-quote` and `create-invoice` line items.
- Added fuzzy product matching and ambiguity guard so generic queries return candidate shortlists instead of silently choosing the wrong product.
