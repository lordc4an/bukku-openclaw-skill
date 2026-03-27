import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SECRETS_PATH = join(__dirname, '../.secrets/bukku.json');

export function loadBukkuConfig() {
  const raw = readFileSync(DEFAULT_SECRETS_PATH, 'utf8');
  const cfg = JSON.parse(raw);
  if (!cfg.baseUrl || !cfg.headers) {
    throw new Error(`Invalid Bukku config in ${DEFAULT_SECRETS_PATH}`);
  }
  const baseUrl = String(cfg.baseUrl).replace(/\/+$/, '');
  const headers = { ...cfg.headers };
  if (!headers.Accept) headers.Accept = 'application/json';
  if (headers['x-company-subdomain'] && !headers['Company-Subdomain']) {
    headers['Company-Subdomain'] = headers['x-company-subdomain'];
  }
  delete headers['x-company-subdomain'];
  return {
    ...cfg,
    baseUrl,
    headers,
  };
}

export async function bukkuRequest(method, path, body) {
  const { baseUrl, headers } = loadBukkuConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body
      ? {
          ...headers,
          'Content-Type': 'application/json',
        }
      : headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const err = new Error(`Bukku API ${method} ${path} failed: ${res.status}`);
    err.status = res.status;
    err.payload = parsed;
    throw err;
  }

  return parsed;
}

export async function bukkuGet(path) {
  return bukkuRequest('GET', path);
}

export async function bukkuPost(path, body) {
  return bukkuRequest('POST', path, body);
}

export async function bukkuPut(path, body) {
  return bukkuRequest('PUT', path, body);
}

export function parseJsonArg(raw, label = 'JSON') {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid ${label}: ${err.message}`);
  }
}

export function unwrapRecord(data, preferredKeys = []) {
  for (const key of preferredKeys) {
    if (data && typeof data === 'object' && data[key] !== undefined) return data[key];
  }
  return data;
}
