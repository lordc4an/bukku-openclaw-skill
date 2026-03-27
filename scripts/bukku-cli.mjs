#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import {
  bukkuGet,
  bukkuPost,
  bukkuPut,
  parseJsonArg,
  unwrapRecord,
} from './_bukku.js';

function die(message, extra) {
  if (extra !== undefined) {
    console.error(message);
    console.error(typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  console.error(`Usage:
  node bukku-cli.mjs find-contact <query>
  node bukku-cli.mjs get-contact <id>
  node bukku-cli.mjs create-contact --body-file <file>
  node bukku-cli.mjs create-contact --body-json '<json>'
  node bukku-cli.mjs list-products [--query '<query-string>']
  node bukku-cli.mjs find-product <query>
  node bukku-cli.mjs resolve-product <query>
  node bukku-cli.mjs get-product <id>
  node bukku-cli.mjs create-product --body-file <file>
  node bukku-cli.mjs create-product --body-json '<json>'
  node bukku-cli.mjs update-product <id> --body-file <file>
  node bukku-cli.mjs update-product <id> --body-json '<json>'
  node bukku-cli.mjs quote-from-product <contact-id-or-query> <product-id-or-query> --quantity <qty> [--date YYYY-MM-DD] [--title <text>] [--description <text>] [--remarks <text>] [--unit-price <price>] [--status draft|pending_approval|ready] [--commit]
  node bukku-cli.mjs invoice-from-product <contact-id-or-query> <product-id-or-query> --quantity <qty> [--date YYYY-MM-DD] [--title <text>] [--description <text>] [--remarks <text>] [--unit-price <price>] [--payment-mode credit|cash] [--status draft|pending_approval|ready] [--commit]
  node bukku-cli.mjs customer-ledger <contact-id-or-query>
  node bukku-cli.mjs list-quotes [--query '<query-string>']
  node bukku-cli.mjs get-quote <id-or-number>
  node bukku-cli.mjs get-invoice <id-or-number>
  node bukku-cli.mjs list-invoices [--query '<query-string>']
  node bukku-cli.mjs payment-status <id-or-number>
  node bukku-cli.mjs top-outstanding [limit]
  node bukku-cli.mjs customer-aging [limit]
  node bukku-cli.mjs aging-buckets
  node bukku-cli.mjs top-outstanding-by-customer [limit]
  node bukku-cli.mjs quote-to-invoice <quote-id-or-number> [--date YYYY-MM-DD] [--status draft|pending_approval|ready] [--payment-mode credit|cash] [--commit]
  node bukku-cli.mjs create-quote --body-file <file>
  node bukku-cli.mjs update-quote <id> --body-file <file>
  node bukku-cli.mjs create-invoice --body-file <file>
  node bukku-cli.mjs update-invoice <id> --body-file <file>
  node bukku-cli.mjs invoice-to-delivery-order <invoice-id-or-number> [--date YYYY-MM-DD] [--status draft|pending_approval|ready] [--commit]
  node bukku-cli.mjs list-delivery-orders [--query '<query-string>']
  node bukku-cli.mjs get-delivery-order <id-or-number>
  node bukku-cli.mjs create-delivery-order --body-file <file>
  node bukku-cli.mjs update-delivery-order <id> --body-file <file>
  node bukku-cli.mjs list-payments [--query '<query-string>']
  node bukku-cli.mjs get-payment <id-or-number>
  node bukku-cli.mjs record-payment-safe <invoice-id-or-number> --amount <amount> [--date YYYY-MM-DD] [--account-id <id>] [--payment-method-id <id>] [--number <ref>] [--description <text>] [--status ready] [--confirm yes] [--commit]
  node bukku-cli.mjs create-payment --body-file <file>
  node bukku-cli.mjs update-payment <id> --body-file <file>
  node bukku-cli.mjs raw <METHOD> <PATH> [--body-file <file>|--body-json '<json>']`);
  process.exit(1);
}

function readBodyArg(args) {
  const fileIdx = args.indexOf('--body-file');
  if (fileIdx !== -1) {
    const file = args[fileIdx + 1];
    if (!file) die('Missing value for --body-file');
    return parseJsonArg(readFileSync(file, 'utf8'), `JSON in ${file}`);
  }

  const jsonIdx = args.indexOf('--body-json');
  if (jsonIdx !== -1) {
    const raw = args[jsonIdx + 1];
    if (!raw) die('Missing value for --body-json');
    return parseJsonArg(raw);
  }

  return null;
}

function readQueryArg(args, fallback = '') {
  const idx = args.indexOf('--query');
  if (idx === -1) return fallback;
  const raw = args[idx + 1];
  if (!raw) die('Missing value for --query');
  return raw.startsWith('?') ? raw : `?${raw}`;
}

function readFlag(args, flag) {
  return args.includes(flag);
}

function readOption(args, flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) die(`Missing value for ${flag}`);
  return value;
}

function normaliseNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function pickFields(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
  }
  return out;
}

const DEFAULT_CURRENCY_CODE = 'MYR';
const DEFAULT_EXCHANGE_RATE = 1;
const DEFAULT_SALES_TAX_MODE = 'exclusive';
const DEFAULT_QUOTE_STATUS = 'ready';
const DEFAULT_SALES_ACCOUNT_ID = 20;

function normalizeStatus(value, fallback) {
  const raw = String(value || fallback || '').trim().toLowerCase();
  if (raw === 'draft' || raw === 'pending_approval' || raw === 'ready') return raw;
  if (raw === 'approved' || raw === 'pending-approval') return 'pending_approval';
  if (raw === 'done' || raw === 'published') return 'ready';
  return fallback;
}

function normalizeTaxMode(value, fallback = DEFAULT_SALES_TAX_MODE) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'inclusive' || raw === 'exclusive') return raw;
  if (raw === 'no_tax' || raw === 'none' || raw === 'no tax') return fallback;
  return fallback;
}

function normalizeEntityType(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'MALAYSIAN_INDIVIDUAL';
  const map = {
    INDIVIDUAL: 'MALAYSIAN_INDIVIDUAL',
    PERSON: 'MALAYSIAN_INDIVIDUAL',
    MALAYSIAN_INDIVIDUAL: 'MALAYSIAN_INDIVIDUAL',
    COMPANY: 'MALAYSIAN_COMPANY',
    BUSINESS: 'MALAYSIAN_COMPANY',
    ORGANISATION: 'MALAYSIAN_COMPANY',
    ORGANIZATION: 'MALAYSIAN_COMPANY',
    MALAYSIAN_COMPANY: 'MALAYSIAN_COMPANY',
  };
  return map[raw] || raw;
}

function normalizeContactTypes(value) {
  if (Array.isArray(value) && value.length) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return ['customer'];
}

function normalizeContactCreateBody(body) {
  return {
    ...body,
    entity_type: normalizeEntityType(body.entity_type),
    types: normalizeContactTypes(body.types),
  };
}

function normalizeFormItemForCreate(item) {
  const mapped = {
    ...item,
  };
  if (mapped.tax_id !== undefined && mapped.tax_code_id === undefined) {
    mapped.tax_code_id = mapped.tax_id;
  }
  delete mapped.tax_id;
  return mapped;
}

function normalizeInvoiceBody(body) {
  const normalized = {
    ...body,
    currency_code: body.currency_code || DEFAULT_CURRENCY_CODE,
    exchange_rate: body.exchange_rate ?? DEFAULT_EXCHANGE_RATE,
    tax_mode: normalizeTaxMode(body.tax_mode),
    status: normalizeStatus(body.status, 'ready'),
  };

  normalized.form_items = Array.isArray(body.form_items)
    ? body.form_items.map(normalizeFormItemForCreate)
    : [];

  if (normalized.term_items && !normalized.term_id) {
    const firstTermId = normalized.term_items.find(item => item?.term_id)?.term_id;
    if (firstTermId) normalized.term_id = firstTermId;
  }

  return normalized;
}

function normalizeQuoteBody(body) {
  return {
    ...normalizeInvoiceBody(body),
    status: normalizeStatus(body.status, DEFAULT_QUOTE_STATUS),
  };
}

function normalizeProductBody(body) {
  const normalized = { ...body };
  if (!normalized.type) normalized.type = 'product';
  if (normalized.is_selling === undefined) normalized.is_selling = true;
  if (normalized.is_buying === undefined) normalized.is_buying = false;
  if (normalized.track_inventory === undefined) normalized.track_inventory = false;

  for (const key of ['sale_price', 'purchase_price', 'quantity', 'quantity_low_alert']) {
    if (normalized[key] !== undefined && normalized[key] !== null && normalized[key] !== '') {
      normalized[key] = Number(normalized[key]);
    }
  }

  return normalized;
}

async function listTransactions(path, query = '') {
  const data = await bukkuGet(`${path}${query || ''}`);
  const transactions = data.transactions || [];
  print({
    paging: data.paging || null,
    count: transactions.length,
    transactions,
  });
}

async function getTransactionByIdOrNumber(path, idOrNumber) {
  if (/^\d+$/.test(idOrNumber)) {
    const data = await bukkuGet(`${path}/${idOrNumber}`);
    print(unwrapRecord(data, ['transaction']));
    return;
  }

  const data = await bukkuGet(`${path}?per_page=100`);
  const transactions = data.transactions || [];
  const wanted = normaliseNumber(idOrNumber);
  const match = transactions.find((transaction) =>
    [transaction.number, transaction.number2, transaction.reference_no]
      .filter(Boolean)
      .map(normaliseNumber)
      .includes(wanted)
  );
  if (!match) die(`Transaction not found: ${idOrNumber}`);
  const full = await bukkuGet(`${path}/${match.id}`);
  print(unwrapRecord(full, ['transaction']));
}

async function fetchTransactionByIdOrNumber(path, idOrNumber) {
  if (/^\d+$/.test(idOrNumber)) {
    const data = await bukkuGet(`${path}/${idOrNumber}`);
    return unwrapRecord(data, ['transaction']);
  }

  const data = await bukkuGet(`${path}?per_page=100`);
  const transactions = data.transactions || [];
  const wanted = normaliseNumber(idOrNumber);
  const match = transactions.find((transaction) =>
    [transaction.number, transaction.number2, transaction.reference_no]
      .filter(Boolean)
      .map(normaliseNumber)
      .includes(wanted)
  );
  if (!match) die(`Transaction not found: ${idOrNumber}`);
  const full = await bukkuGet(`${path}/${match.id}`);
  return unwrapRecord(full, ['transaction']);
}

async function resolveContact(input) {
  if (/^\d+$/.test(input)) {
    const data = await bukkuGet(`/contacts/${input}`);
    return unwrapRecord(data, ['contact']);
  }

  const data = await bukkuGet(`/contacts?search=${encodeURIComponent(input)}&page_size=50`);
  const contacts = data.contacts || [];
  if (contacts.length === 0) die(`Contact not found: ${input}`);
  const wanted = input.trim().toLowerCase();
  const exact = contacts.find((contact) =>
    [contact.display_name, contact.legal_name, contact.other_name]
      .filter(Boolean)
      .some((value) => String(value).trim().toLowerCase() === wanted)
  );
  return exact || contacts[0];
}

function buildInvoiceOutstandingRows(invoices, today = toDateOnly(new Date())) {
  return invoices
    .map((invoice) => {
      const overdueTerms = (invoice.term_items || []).filter((term) => {
        if (!term.balance || term.balance <= 0) return false;
        return toDateOnly(term.date) <= today;
      });
      const overdueBalance = overdueTerms.reduce((sum, term) => sum + Number(term.balance || 0), 0);
      if (!overdueBalance) return null;
      const dueDates = overdueTerms.map((term) => term.date).sort();
      return {
        id: invoice.id,
        number: invoice.number,
        contact_id: invoice.contact_id,
        contact_name: invoice.contact_name,
        date: invoice.date,
        balance: Number(invoice.balance || 0),
        overdue_balance: overdueBalance,
        oldest_due_date: dueDates[0] || null,
        due_dates: dueDates,
        short_link: invoice.short_link,
        title: invoice.title,
        description: invoice.description,
        billing_party: invoice.billing_party,
      };
    })
    .filter(Boolean);
}

async function fetchAllInvoices() {
  const perPage = 50;
  let page = 1;
  let invoices = [];

  for (;;) {
    const data = await bukkuGet(`/sales/invoices?per_page=${perPage}&page=${page}`);
    const batch = data.transactions || [];
    invoices = invoices.concat(batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return invoices;
}

async function fetchAllPayments(query = '') {
  const perPage = 50;
  let page = 1;
  let payments = [];

  for (;;) {
    const glue = query ? `${query}&` : '?';
    const data = await bukkuGet(`/sales/payments${glue}per_page=${perPage}&page=${page}`);
    const batch = data.transactions || [];
    payments = payments.concat(batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return payments;
}

async function findContact(query) {
  const data = await bukkuGet(`/contacts?search=${encodeURIComponent(query)}&page_size=50`);
  const contacts = data.contacts || [];
  print({
    query,
    count: contacts.length,
    contacts,
  });
}

async function getContact(id) {
  const data = await bukkuGet(`/contacts/${id}`);
  print(unwrapRecord(data, ['contact']));
}

async function createContact(body) {
  const data = await bukkuPost('/contacts', normalizeContactCreateBody(body));
  print(unwrapRecord(data, ['contact']));
}

async function listProducts(query = '') {
  const data = await bukkuGet(`/products${query || ''}`);
  const products = data.products || [];
  print({
    paging: data.paging || null,
    count: products.length,
    products,
  });
}

async function findProduct(query) {
  const data = await bukkuGet(`/products?search=${encodeURIComponent(query)}&page_size=50`);
  const products = data.products || [];
  print({
    query,
    count: products.length,
    products,
  });
}

async function getProduct(id) {
  const data = await bukkuGet(`/products/${id}`);
  print(unwrapRecord(data, ['product']));
}

async function resolveProductCommand(query) {
  const resolved = await resolveProductCandidates(query, true);
  if (resolved.kind === 'match') {
    const detail = await bukkuGet(`/products/${resolved.product.id}`);
    print({
      kind: 'match',
      query,
      score: resolved.score,
      candidates: resolved.candidates,
      product: unwrapRecord(detail, ['product']),
    });
    return;
  }

  print({
    kind: resolved.kind,
    query,
    candidates: resolved.candidates || [],
  });
}

async function createProduct(body) {
  const data = await bukkuPost('/products', normalizeProductBody(body));
  print(unwrapRecord(data, ['product']));
}

async function updateProduct(id, body) {
  const data = await bukkuPut(`/products/${id}`, normalizeProductBody(body));
  print(unwrapRecord(data, ['product']));
}

function normalizeProductText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/mirrorkote/g, 'mirrorkot')
    .replace(/art\s*card/g, 'artcard')
    .replace(/art\s*paper/g, 'artpaper')
    .replace(/white\s*pp/g, 'whitepp')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(cm|mm|ft|feet|inci|inch|x)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeProductText(value) {
  return normalizeProductText(value)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function scoreProductMatch(query, product) {
  const wanted = normalizeProductText(query);
  const name = normalizeProductText(product.name);
  if (!wanted || !name) return -1;

  let score = 0;
  if (name === wanted) score += 1000;
  if (name.startsWith(wanted)) score += 300;
  if (wanted.startsWith(name)) score += 220;
  if (name.includes(wanted)) score += 160;
  if (wanted.includes(name)) score += 140;

  const wantedTokens = tokenizeProductText(wanted);
  const nameTokens = tokenizeProductText(name);
  const nameSet = new Set(nameTokens);

  for (const token of wantedTokens) {
    if (nameSet.has(token)) {
      score += 45;
      continue;
    }
    const prefixMatch = nameTokens.find(nameToken => nameToken.startsWith(token) || token.startsWith(nameToken));
    if (prefixMatch) score += 18;
  }

  if (wanted.includes('sticker') && name.includes('sticker')) score += 60;
  if (wanted.includes('banner') && name.includes('banner')) score += 60;
  if (wanted.includes('stamp') && name.includes('stamp')) score += 60;

  if (product.sale_price != null) score += 5;
  return score;
}

async function fetchProductCandidates(query) {
  const data = await bukkuGet(`/products?search=${encodeURIComponent(query)}&page_size=50`);
  const products = data.products || [];
  if (products.length > 0) return products;

  const all = await bukkuGet('/products?page_size=100');
  return all.products || [];
}

function buildProductCandidateSummary(ranked, limit = 5) {
  return ranked.slice(0, limit).map(({ product, score }) => ({
    id: product.id,
    name: product.name,
    sale_price: product.sale_price,
    score,
  }));
}

function evaluateRankedProductMatch(query, ranked, strict = true) {
  const best = ranked[0];
  if (!best) return { kind: 'none' };

  const second = ranked[1];
  const topCandidates = buildProductCandidateSummary(ranked);
  const tokens = tokenizeProductText(query);
  const genericSingleToken = tokens.length === 1 && ['sticker', 'banner', 'stamp', 'rubber', 'colop'].includes(tokens[0]);

  if (best.score < 40) {
    return { kind: 'none', candidates: topCandidates };
  }

  if (strict && genericSingleToken) {
    return {
      kind: 'ambiguous',
      query,
      candidates: topCandidates,
    };
  }

  const highlyConfident = best.score >= 220;
  const clearGap = !second || best.score - second.score >= 35;

  if (!strict || highlyConfident || clearGap) {
    return { kind: 'match', product: best.product, score: best.score, candidates: topCandidates };
  }

  return {
    kind: 'ambiguous',
    query,
    candidates: topCandidates,
  };
}

async function resolveProductCandidates(query, strict = true) {
  const products = await fetchProductCandidates(query);
  if (products.length === 0) {
    return {
      kind: 'none',
      query,
      candidates: [],
    };
  }

  const ranked = products
    .map(product => ({ product, score: scoreProductMatch(query, product) }))
    .sort((a, b) => b.score - a.score);

  return evaluateRankedProductMatch(query, ranked, strict);
}

async function resolveProduct(input) {
  if (/^\d+$/.test(input)) {
    const data = await bukkuGet(`/products/${input}`);
    return unwrapRecord(data, ['product']);
  }

  const resolved = await resolveProductCandidates(input, true);
  if (resolved.kind === 'none') die(`Product not found: ${input}`, { query: input, candidates: resolved.candidates || [] });
  if (resolved.kind === 'ambiguous') die(`Product match is ambiguous: ${input}`, resolved);

  const detail = await bukkuGet(`/products/${resolved.product.id}`);
  return unwrapRecord(detail, ['product']);
}

async function resolveProductByDescription(description) {
  const query = String(description || '').trim();
  if (!query) return null;

  const resolved = await resolveProductCandidates(query, true);
  if (resolved.kind === 'none') return null;
  if (resolved.kind === 'ambiguous') return resolved;

  const detail = await bukkuGet(`/products/${resolved.product.id}`);
  return unwrapRecord(detail, ['product']);
}

function pickProductUnit(product) {
  const units = Array.isArray(product.units) ? product.units : [];
  return (
    units.find((unit) => unit.is_sale_default) ||
    units.find((unit) => unit.is_base) ||
    units[0] ||
    null
  );
}

function toNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) die(`Invalid ${label}`);
  return number;
}

function buildProductFormItem(product, args) {
  const unit = pickProductUnit(product);
  const quantity = toNumber(readOption(args, '--quantity'), '--quantity');
  const explicitUnitPrice = readOption(args, '--unit-price', null);
  const defaultUnitPrice =
    unit?.sale_price ??
    product.sale_prices?.[0]?.price ??
    product.sale_price ??
    null;
  const unitPrice = explicitUnitPrice !== null ? toNumber(explicitUnitPrice, '--unit-price') : Number(defaultUnitPrice);

  if (!Number.isFinite(unitPrice)) {
    die(`Product ${product.name} has no sale price; pass --unit-price explicitly`);
  }

  return {
    account_id: Number(product.sale_account_id || DEFAULT_SALES_ACCOUNT_ID),
    description: readOption(args, '--line-description', product.sale_description || product.name),
    product_id: product.id,
    ...(unit?.id ? { product_unit_id: unit.id } : {}),
    quantity,
    unit_price: unitPrice,
    ...(product.sale_tax_code_id ? { tax_code_id: Number(product.sale_tax_code_id) } : {}),
    ...(product.classification_code ? { classification_code: product.classification_code } : {}),
  };
}

async function enrichFormItemsWithProducts(items) {
  const enriched = [];

  for (const item of items || []) {
    const normalized = normalizeFormItemForCreate(item);
    const hasStructuredProduct = normalized.product_id || normalized.type === 'subtotal' || normalized.type === 'subtitle' || normalized.type === 'bundle';
    if (hasStructuredProduct) {
      if (!normalized.account_id && normalized.type == null) {
        normalized.account_id = DEFAULT_SALES_ACCOUNT_ID;
      }
      enriched.push(normalized);
      continue;
    }

    const product = await resolveProductByDescription(normalized.description);
    if (!product) {
      if (!normalized.account_id && normalized.type == null) {
        normalized.account_id = DEFAULT_SALES_ACCOUNT_ID;
      }
      enriched.push(normalized);
      continue;
    }
    if (product.kind === 'ambiguous') {
      const err = new Error(`Product match is ambiguous for line item: ${normalized.description}`);
      err.payload = {
        query: normalized.description,
        candidates: product.candidates,
      };
      throw err;
    }

    const unit = pickProductUnit(product);
    enriched.push({
      ...normalized,
      account_id: Number(normalized.account_id || product.sale_account_id || DEFAULT_SALES_ACCOUNT_ID),
      description: normalized.description || product.sale_description || product.name,
      product_id: normalized.product_id || product.id,
      ...(normalized.product_unit_id || unit?.id ? { product_unit_id: normalized.product_unit_id || unit.id } : {}),
      ...(normalized.tax_code_id || product.sale_tax_code_id ? { tax_code_id: Number(normalized.tax_code_id || product.sale_tax_code_id) } : {}),
      ...(normalized.classification_code || product.classification_code ? { classification_code: normalized.classification_code || product.classification_code } : {}),
      ...(normalized.unit_price !== undefined && normalized.unit_price !== null
        ? {}
        : { unit_price: unit?.sale_price ?? product.sale_price ?? normalized.unit_price }),
    });
  }

  return enriched;
}

async function prepareQuoteBody(body) {
  const normalized = normalizeQuoteBody(body);
  normalized.form_items = await enrichFormItemsWithProducts(normalized.form_items);
  return normalized;
}

async function prepareInvoiceBody(body) {
  const normalized = normalizeInvoiceBody(body);
  normalized.form_items = await enrichFormItemsWithProducts(normalized.form_items);
  return normalized;
}

function buildProductTransactionBody(kind, contact, product, args) {
  const formItem = buildProductFormItem(product, args);
  const productLabel = product.name || `Product ${product.id}`;
  const base = {
    contact_id: contact.id,
    date: readOption(args, '--date', new Date().toISOString().slice(0, 10)),
    currency_code: DEFAULT_CURRENCY_CODE,
    exchange_rate: DEFAULT_EXCHANGE_RATE,
    billing_party: contact.billing_party || undefined,
    title: readOption(args, '--title', productLabel),
    description: readOption(args, '--description', product.sale_description || productLabel),
    remarks: readOption(args, '--remarks', undefined),
    tax_mode: normalizeTaxMode(readOption(args, '--tax-mode', product.sale_tax_code_id ? 'exclusive' : DEFAULT_SALES_TAX_MODE)),
    status: normalizeStatus(readOption(args, '--status', kind === 'quote' ? DEFAULT_QUOTE_STATUS : 'ready'), kind === 'quote' ? DEFAULT_QUOTE_STATUS : 'ready'),
    form_items: [formItem],
  };

  if (kind === 'invoice') {
    return {
      payment_mode: readOption(args, '--payment-mode', 'credit'),
      ...base,
    };
  }

  return base;
}

async function quoteFromProduct(contactInput, productInput, args) {
  const [contact, product] = await Promise.all([
    resolveContact(contactInput),
    resolveProduct(productInput),
  ]);
  const body = buildProductTransactionBody('quote', contact, product, args);

  if (readFlag(args, '--commit')) {
    const data = await bukkuPost('/sales/quotes', await prepareQuoteBody(body));
    print({
      mode: 'created',
      contact: { id: contact.id, name: contact.display_name || contact.legal_name },
      product: { id: product.id, name: product.name },
      transaction: unwrapRecord(data, ['transaction']),
    });
    return;
  }

  print({
    mode: 'draft',
    contact: { id: contact.id, name: contact.display_name || contact.legal_name },
    product: { id: product.id, name: product.name },
    body: await prepareQuoteBody(body),
  });
}

async function invoiceFromProduct(contactInput, productInput, args) {
  const [contact, product] = await Promise.all([
    resolveContact(contactInput),
    resolveProduct(productInput),
  ]);
  const body = buildProductTransactionBody('invoice', contact, product, args);

  if (readFlag(args, '--commit')) {
    const data = await bukkuPost('/sales/invoices', await prepareInvoiceBody(body));
    print({
      mode: 'created',
      contact: { id: contact.id, name: contact.display_name || contact.legal_name },
      product: { id: product.id, name: product.name },
      transaction: unwrapRecord(data, ['transaction']),
    });
    return;
  }

  print({
    mode: 'draft',
    contact: { id: contact.id, name: contact.display_name || contact.legal_name },
    product: { id: product.id, name: product.name },
    body: await prepareInvoiceBody(body),
  });
}

async function getInvoice(idOrNumber) {
  await getTransactionByIdOrNumber('/sales/invoices', idOrNumber);
}

function toDateOnly(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

async function topOutstanding(limitRaw) {
  const limit = Math.max(1, Number.parseInt(limitRaw || '5', 10) || 5);
  const outstanding = buildInvoiceOutstandingRows(await fetchAllInvoices())
    .filter(Boolean)
    .sort((a, b) =>
      b.overdue_balance - a.overdue_balance ||
      String(a.oldest_due_date).localeCompare(String(b.oldest_due_date)) ||
      String(a.number).localeCompare(String(b.number))
    );

  const top = outstanding.slice(0, limit);
  print({
    generated_at: new Date().toISOString(),
    criteria: 'Invoices with overdue term_items balance > 0 and due date on or before today',
    total_outstanding_invoices: outstanding.length,
    total_overdue_balance: formatMoney(outstanding.reduce((sum, item) => sum + item.overdue_balance, 0)),
    results: top.map((item, index) => ({
      rank: index + 1,
      ...item,
      balance: formatMoney(item.balance),
      overdue_balance: formatMoney(item.overdue_balance),
    })),
  });
}

async function customerAging(limitRaw) {
  const limit = Math.max(1, Number.parseInt(limitRaw || '10', 10) || 10);
  const rows = buildInvoiceOutstandingRows(await fetchAllInvoices());
  const byCustomer = new Map();

  for (const row of rows) {
    const key = `${row.contact_id}:${row.contact_name}`;
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        contact_id: row.contact_id,
        contact_name: row.contact_name,
        overdue_balance: 0,
        invoice_count: 0,
        oldest_due_date: row.oldest_due_date,
        invoices: [],
      });
    }
    const customer = byCustomer.get(key);
    customer.overdue_balance += row.overdue_balance;
    customer.invoice_count += 1;
    if (row.oldest_due_date && (!customer.oldest_due_date || row.oldest_due_date < customer.oldest_due_date)) {
      customer.oldest_due_date = row.oldest_due_date;
    }
    customer.invoices.push({
      id: row.id,
      number: row.number,
      overdue_balance: formatMoney(row.overdue_balance),
      due_dates: row.due_dates,
      short_link: row.short_link,
      title: row.title,
      description: row.description,
    });
  }

  const results = Array.from(byCustomer.values())
    .sort((a, b) =>
      b.overdue_balance - a.overdue_balance ||
      String(a.oldest_due_date).localeCompare(String(b.oldest_due_date)) ||
      String(a.contact_name).localeCompare(String(b.contact_name))
    )
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      overdue_balance: formatMoney(item.overdue_balance),
    }));

  print({
    generated_at: new Date().toISOString(),
    criteria: 'Grouped overdue invoice balances by customer',
    total_customers: byCustomer.size,
    total_overdue_balance: formatMoney(rows.reduce((sum, item) => sum + item.overdue_balance, 0)),
    results,
  });
}

async function paymentStatus(idOrNumber) {
  const invoice = await fetchTransactionByIdOrNumber('/sales/invoices', idOrNumber);

  const termItems = invoice.term_items || [];
  const dueBalance = termItems.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const paidAmount = Number(invoice.amount || 0) - Number(invoice.balance || 0);
  print({
    id: invoice.id,
    number: invoice.number,
    contact_id: invoice.contact_id,
    contact_name: invoice.contact_name,
    date: invoice.date,
    amount: formatMoney(invoice.amount),
    balance: formatMoney(invoice.balance),
    paid_amount: formatMoney(paidAmount),
    payment_mode: invoice.payment_mode,
    status: invoice.status,
    is_fully_paid: Number(invoice.balance || 0) <= 0,
    due_balance_from_terms: formatMoney(dueBalance),
    term_items: termItems.map((item) => ({
      id: item.id,
      date: item.date,
      amount: formatMoney(item.amount),
      balance: formatMoney(item.balance),
    })),
    short_link: invoice.short_link,
  });
}

async function customerLedger(contactInput) {
  const contact = await resolveContact(contactInput);
  const invoices = await fetchAllInvoices();
  const payments = await fetchAllPayments();
  const contactInvoices = invoices
    .filter((invoice) => Number(invoice.contact_id) === Number(contact.id))
    .map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      date: invoice.date,
      amount: formatMoney(invoice.amount),
      balance: formatMoney(invoice.balance),
      status: invoice.status,
      payment_mode: invoice.payment_mode,
      short_link: invoice.short_link,
      description: invoice.description,
      title: invoice.title,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const contactPayments = payments
    .filter((payment) => Number(payment.contact_id) === Number(contact.id))
    .map((payment) => ({
      id: payment.id,
      number: payment.number,
      number2: payment.number2,
      date: payment.date,
      amount: formatMoney(payment.amount),
      status: payment.status,
      short_link: payment.short_link,
      description: payment.description,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  print({
    contact: {
      id: contact.id,
      display_name: contact.display_name,
      legal_name: contact.legal_name,
      phone_no: contact.phone_no,
      email: contact.email,
      billing_party: contact.billing_party,
    },
    totals: {
      receivable_amount: formatMoney(contact.receivable_amount),
      payable_amount: formatMoney(contact.payable_amount),
      net_receivable_amount: formatMoney(contact.net_receivable_amount),
      invoice_count: contactInvoices.length,
      payment_count: contactPayments.length,
    },
    invoices: contactInvoices,
    payments: contactPayments,
  });
}

async function agingBuckets() {
  const today = toDateOnly(new Date());
  const rows = buildInvoiceOutstandingRows(await fetchAllInvoices(), today);
  const buckets = {
    current: { label: 'current', amount: 0, invoices: [] },
    due_0_30: { label: '0-30 days overdue', amount: 0, invoices: [] },
    due_31_60: { label: '31-60 days overdue', amount: 0, invoices: [] },
    due_61_90: { label: '61-90 days overdue', amount: 0, invoices: [] },
    due_91_plus: { label: '91+ days overdue', amount: 0, invoices: [] },
  };

  for (const row of rows) {
    const days = Math.floor((today - toDateOnly(row.oldest_due_date)) / 86400000);
    let bucket = buckets.current;
    if (days > 90) bucket = buckets.due_91_plus;
    else if (days > 60) bucket = buckets.due_61_90;
    else if (days > 30) bucket = buckets.due_31_60;
    else if (days >= 0) bucket = buckets.due_0_30;
    bucket.amount += row.overdue_balance;
    bucket.invoices.push({
      id: row.id,
      number: row.number,
      contact_name: row.contact_name,
      overdue_balance: formatMoney(row.overdue_balance),
      oldest_due_date: row.oldest_due_date,
      days_overdue: days,
      short_link: row.short_link,
    });
  }

  print({
    generated_at: new Date().toISOString(),
    total_overdue_balance: formatMoney(rows.reduce((sum, row) => sum + row.overdue_balance, 0)),
    buckets: Object.values(buckets).map((bucket) => ({
      label: bucket.label,
      amount: formatMoney(bucket.amount),
      invoice_count: bucket.invoices.length,
      invoices: bucket.invoices.sort((a, b) => b.days_overdue - a.days_overdue),
    })),
  });
}

function mapFormItemForCreate(item, opts = {}) {
  const mapped = pickFields(item, [
    'type',
    'account_id',
    'description',
    'service_date',
    'product_id',
    'product_unit_id',
    'location_id',
    'unit_price',
    'quantity',
    'discount',
    'tax_code_id',
    'classification_code',
  ]);
  if (opts.transfer && item.id) mapped.transfer_item_id = item.id;
  if (Array.isArray(item.children) && item.children.length) {
    mapped.children = item.children.map((child) => pickFields(child, [
      'account_id',
      'description',
      'service_date',
      'product_id',
      'product_unit_id',
      'location_id',
      'unit_price',
      'quantity',
      'discount',
      'tax_code_id',
      'classification_code',
    ]));
  }
  return mapped;
}

function mapTermItemForCreate(item) {
  return pickFields(item, ['term_id', 'date', 'payment_due', 'description']);
}

async function quoteToInvoice(idOrNumber, args) {
  const quote = await fetchTransactionByIdOrNumber('/sales/quotes', idOrNumber);
  const body = {
    payment_mode: readOption(args, '--payment-mode', 'credit'),
    contact_id: quote.contact_id,
    date: readOption(args, '--date', quote.date),
    currency_code: quote.currency_code,
    exchange_rate: quote.exchange_rate,
    billing_party: quote.billing_party,
    show_shipping: quote.show_shipping,
    shipping_party: quote.shipping_party,
    shipping_info: quote.shipping_info,
    tag_ids: quote.tag_ids || [],
    title: quote.title,
    description: quote.description,
    remarks: quote.remarks,
    tax_mode: quote.tax_mode,
    form_items: (quote.form_items || []).map((item) => mapFormItemForCreate(item)),
    term_items: (quote.term_items || []).map(mapTermItemForCreate),
    status: readOption(args, '--status', 'draft'),
  };
  if (readFlag(args, '--commit')) {
    const data = await bukkuPost('/sales/invoices', body);
    print({
      source_quote: { id: quote.id, number: quote.number },
      mode: 'created',
      transaction: unwrapRecord(data, ['transaction']),
    });
    return;
  }
  print({
    source_quote: { id: quote.id, number: quote.number },
    mode: 'draft',
    body,
  });
}

async function invoiceToDeliveryOrder(idOrNumber, args) {
  const invoice = await fetchTransactionByIdOrNumber('/sales/invoices', idOrNumber);
  const body = {
    contact_id: invoice.contact_id,
    date: readOption(args, '--date', invoice.date),
    currency_code: invoice.currency_code,
    exchange_rate: invoice.exchange_rate,
    billing_party: invoice.billing_party,
    show_shipping: invoice.show_shipping,
    shipping_party: invoice.shipping_party,
    shipping_info: invoice.shipping_info,
    tag_ids: invoice.tag_ids || [],
    title: invoice.title,
    description: invoice.description,
    remarks: invoice.remarks,
    tax_mode: invoice.tax_mode,
    form_items: (invoice.form_items || []).map((item) => mapFormItemForCreate(item, { transfer: true })),
    status: readOption(args, '--status', 'draft'),
  };
  if (readFlag(args, '--commit')) {
    const data = await bukkuPost('/sales/delivery_orders', body);
    print({
      source_invoice: { id: invoice.id, number: invoice.number },
      mode: 'created',
      transaction: unwrapRecord(data, ['transaction']),
    });
    return;
  }
  print({
    source_invoice: { id: invoice.id, number: invoice.number },
    mode: 'draft',
    body,
  });
}

async function recordPaymentSafe(idOrNumber, args) {
  const invoice = await fetchTransactionByIdOrNumber('/sales/invoices', idOrNumber);
  const amount = Number(readOption(args, '--amount'));
  if (!(amount > 0)) die('Invalid --amount');
  const balance = Number(invoice.balance || 0);
  if (balance <= 0) die(`Invoice ${invoice.number} is already fully paid`);
  if (amount > balance) die(`Amount ${amount} exceeds invoice balance ${balance}`);

  const body = {
    contact_id: invoice.contact_id,
    date: readOption(args, '--date', new Date().toISOString().slice(0, 10)),
    currency_code: invoice.currency_code,
    exchange_rate: invoice.exchange_rate,
    amount,
    description: readOption(args, '--description', `Payment received for ${invoice.number}`),
    status: readOption(args, '--status', 'ready'),
    link_items: [
      {
        target_transaction_id: invoice.id,
        apply_amount: amount,
      },
    ],
    deposit_items: [
      {
        payment_method_id: Number(readOption(args, '--payment-method-id', '1')),
        account_id: Number(readOption(args, '--account-id', '3')),
        amount,
        number: readOption(args, '--number', undefined),
      },
    ],
  };
  if (body.deposit_items[0].number === undefined) {
    delete body.deposit_items[0].number;
  }

  const confirmed = readOption(args, '--confirm', 'no');
  if (readFlag(args, '--commit')) {
    if (confirmed !== 'yes') {
      die('record-payment-safe requires --confirm yes together with --commit');
    }
    const data = await bukkuPost('/sales/payments', body);
    print({
      source_invoice: { id: invoice.id, number: invoice.number, balance: formatMoney(invoice.balance) },
      mode: 'created',
      transaction: unwrapRecord(data, ['transaction']),
    });
    return;
  }

  print({
    source_invoice: { id: invoice.id, number: invoice.number, balance: formatMoney(invoice.balance) },
    mode: 'draft',
    commit_guard: 'Add --commit --confirm yes to actually create the Bukku payment',
    body,
  });
}

async function createQuote(body) {
  const data = await bukkuPost('/sales/quotes', await prepareQuoteBody(body));
  print(unwrapRecord(data, ['transaction']));
}

async function updateQuote(id, body) {
  const data = await bukkuPut(`/sales/quotes/${id}`, await prepareQuoteBody(body));
  print(unwrapRecord(data, ['transaction']));
}

async function createInvoice(body) {
  const data = await bukkuPost('/sales/invoices', await prepareInvoiceBody(body));
  print(unwrapRecord(data, ['transaction']));
}

async function updateInvoice(id, body) {
  const data = await bukkuPut(`/sales/invoices/${id}`, await prepareInvoiceBody(body));
  print(unwrapRecord(data, ['transaction']));
}

async function createDeliveryOrder(body) {
  const data = await bukkuPost('/sales/delivery_orders', body);
  print(unwrapRecord(data, ['transaction']));
}

async function updateDeliveryOrder(id, body) {
  const data = await bukkuPut(`/sales/delivery_orders/${id}`, body);
  print(unwrapRecord(data, ['transaction']));
}

async function createPayment(body) {
  const data = await bukkuPost('/sales/payments', body);
  print(unwrapRecord(data, ['transaction']));
}

async function updatePayment(id, body) {
  const data = await bukkuPut(`/sales/payments/${id}`, body);
  print(unwrapRecord(data, ['transaction']));
}

async function rawRequest(method, path, body) {
  let data;
  if (method === 'GET') {
    data = await bukkuGet(path);
  } else if (method === 'POST') {
    data = await bukkuPost(path, body ?? {});
  } else if (method === 'PUT') {
    data = await bukkuPut(path, body ?? {});
  } else {
    die(`Unsupported method: ${method}`);
  }
  print(data);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  if (!command) usage();

  try {
    if (command === 'find-contact') {
      const query = rest[0];
      if (!query) usage();
      await findContact(query);
      return;
    }

    if (command === 'get-contact') {
      const id = rest[0];
      if (!id) usage();
      await getContact(id);
      return;
    }

    if (command === 'create-contact') {
      const body = readBodyArg(rest);
      if (!body) usage();
      await createContact(body);
      return;
    }

    if (command === 'list-products') {
      await listProducts(readQueryArg(rest, '?page_size=30'));
      return;
    }

    if (command === 'find-product') {
      const query = rest[0];
      if (!query) usage();
      await findProduct(query);
      return;
    }

    if (command === 'resolve-product') {
      const query = rest[0];
      if (!query) usage();
      await resolveProductCommand(query);
      return;
    }

    if (command === 'get-product') {
      const id = rest[0];
      if (!id) usage();
      await getProduct(id);
      return;
    }

    if (command === 'create-product') {
      const body = readBodyArg(rest);
      if (!body) usage();
      await createProduct(body);
      return;
    }

    if (command === 'update-product') {
      const id = rest[0];
      if (!id) usage();
      const body = readBodyArg(rest.slice(1));
      if (!body) usage();
      await updateProduct(id, body);
      return;
    }

    if (command === 'quote-from-product') {
      const contactInput = rest[0];
      const productInput = rest[1];
      if (!contactInput || !productInput) usage();
      await quoteFromProduct(contactInput, productInput, rest.slice(2));
      return;
    }

    if (command === 'invoice-from-product') {
      const contactInput = rest[0];
      const productInput = rest[1];
      if (!contactInput || !productInput) usage();
      await invoiceFromProduct(contactInput, productInput, rest.slice(2));
      return;
    }

    if (command === 'customer-ledger') {
      const contactInput = rest[0];
      if (!contactInput) usage();
      await customerLedger(contactInput);
      return;
    }

    if (command === 'get-invoice') {
      const idOrNumber = rest[0];
      if (!idOrNumber) usage();
      await getInvoice(idOrNumber);
      return;
    }

    if (command === 'list-quotes') {
      await listTransactions('/sales/quotes', readQueryArg(rest, '?page_size=30'));
      return;
    }

    if (command === 'get-quote') {
      const idOrNumber = rest[0];
      if (!idOrNumber) usage();
      await getTransactionByIdOrNumber('/sales/quotes', idOrNumber);
      return;
    }

    if (command === 'list-invoices') {
      await listTransactions('/sales/invoices', readQueryArg(rest, '?page_size=30'));
      return;
    }

    if (command === 'payment-status') {
      const idOrNumber = rest[0];
      if (!idOrNumber) usage();
      await paymentStatus(idOrNumber);
      return;
    }

    if (command === 'top-outstanding') {
      await topOutstanding(rest[0]);
      return;
    }

    if (command === 'customer-aging' || command === 'top-outstanding-by-customer') {
      await customerAging(rest[0]);
      return;
    }

    if (command === 'aging-buckets') {
      await agingBuckets();
      return;
    }

    if (command === 'quote-to-invoice') {
      const idOrNumber = rest[0];
      if (!idOrNumber) usage();
      await quoteToInvoice(idOrNumber, rest.slice(1));
      return;
    }

    if (command === 'create-quote') {
      const body = readBodyArg(rest);
      if (!body) usage();
      await createQuote(body);
      return;
    }

    if (command === 'update-quote') {
      const id = rest[0];
      if (!id) usage();
      const body = readBodyArg(rest.slice(1));
      if (!body) usage();
      await updateQuote(id, body);
      return;
    }

    if (command === 'create-invoice') {
      const body = readBodyArg(rest);
      if (!body) usage();
      await createInvoice(body);
      return;
    }

    if (command === 'invoice-to-delivery-order') {
      const idOrNumber = rest[0];
      if (!idOrNumber) usage();
      await invoiceToDeliveryOrder(idOrNumber, rest.slice(1));
      return;
    }

    if (command === 'update-invoice') {
      const id = rest[0];
      if (!id) usage();
      const body = readBodyArg(rest.slice(1));
      if (!body) usage();
      await updateInvoice(id, body);
      return;
    }

    if (command === 'create-delivery-order') {
      const body = readBodyArg(rest);
      if (!body) usage();
      await createDeliveryOrder(body);
      return;
    }

    if (command === 'list-delivery-orders') {
      await listTransactions('/sales/delivery_orders', readQueryArg(rest, '?page_size=30'));
      return;
    }

    if (command === 'get-delivery-order') {
      const idOrNumber = rest[0];
      if (!idOrNumber) usage();
      await getTransactionByIdOrNumber('/sales/delivery_orders', idOrNumber);
      return;
    }

    if (command === 'update-delivery-order') {
      const id = rest[0];
      if (!id) usage();
      const body = readBodyArg(rest.slice(1));
      if (!body) usage();
      await updateDeliveryOrder(id, body);
      return;
    }

    if (command === 'list-payments') {
      await listTransactions('/sales/payments', readQueryArg(rest, '?page_size=30'));
      return;
    }

    if (command === 'get-payment') {
      const idOrNumber = rest[0];
      if (!idOrNumber) usage();
      await getTransactionByIdOrNumber('/sales/payments', idOrNumber);
      return;
    }

    if (command === 'create-payment') {
      const body = readBodyArg(rest);
      if (!body) usage();
      await createPayment(body);
      return;
    }

    if (command === 'record-payment-safe') {
      const idOrNumber = rest[0];
      if (!idOrNumber) usage();
      await recordPaymentSafe(idOrNumber, rest.slice(1));
      return;
    }

    if (command === 'update-payment') {
      const id = rest[0];
      if (!id) usage();
      const body = readBodyArg(rest.slice(1));
      if (!body) usage();
      await updatePayment(id, body);
      return;
    }

    if (command === 'raw') {
      const method = (rest[0] || '').toUpperCase();
      const path = rest[1];
      if (!method || !path) usage();
      const body = readBodyArg(rest.slice(2));
      await rawRequest(method, path, body);
      return;
    }

    usage();
  } catch (err) {
    die(err.message, err.payload);
  }
}

await main();
