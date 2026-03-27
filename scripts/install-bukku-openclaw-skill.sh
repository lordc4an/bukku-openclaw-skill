#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
TARGET_WORKSPACE="${1:-$DEFAULT_WORKSPACE}"

TARGET_SCRIPTS_DIR="$TARGET_WORKSPACE/scripts"
TARGET_SKILLS_DIR="$TARGET_WORKSPACE/skills/bukku-ops"
TARGET_SECRETS_DIR="$TARGET_WORKSPACE/.secrets"
TARGET_SECRET_FILE="$TARGET_SECRETS_DIR/bukku.json"

normalize_subdomain() {
  local raw="$1"
  raw="${raw#https://}"
  raw="${raw#http://}"
  raw="${raw%%/*}"
  raw="${raw%%.bukku.my}"
  raw="${raw%%.bukku.fyi}"
  printf '%s' "$raw"
}

prompt_value() {
  local label="$1"
  local var_name="$2"
  local secret="${3:-false}"
  local value
  if [[ "$secret" == "true" ]]; then
    read -r -s -p "$label: " value
    printf '\n' >&2
  else
    read -r -p "$label: " value
  fi
  if [[ -z "$value" ]]; then
    echo "Missing required value: $label" >&2
    exit 1
  fi
  printf -v "$var_name" '%s' "$value"
}

echo "Installing Bukku OpenClaw bundle into: $TARGET_WORKSPACE"

mkdir -p "$TARGET_SCRIPTS_DIR" "$TARGET_SKILLS_DIR" "$TARGET_SECRETS_DIR"

prompt_value "Bukku company subdomain (example: yzprinter or yzprinter.bukku.my)" RAW_SUBDOMAIN
prompt_value "Bukku API secret key" API_SECRET true

COMPANY_SUBDOMAIN="$(normalize_subdomain "$RAW_SUBDOMAIN")"
if [[ -z "$COMPANY_SUBDOMAIN" ]]; then
  echo "Failed to normalize Bukku subdomain." >&2
  exit 1
fi

install -m 0644 "$ROOT_DIR/scripts/bukku-cli.mjs" "$TARGET_SCRIPTS_DIR/bukku-cli.mjs"
install -m 0644 "$ROOT_DIR/scripts/_bukku.js" "$TARGET_SCRIPTS_DIR/_bukku.js"
install -m 0644 "$ROOT_DIR/skills/bukku-ops/SKILL.md" "$TARGET_SKILLS_DIR/SKILL.md"

umask 077
cat > "$TARGET_SECRET_FILE" <<EOF
{
  "baseUrl": "https://api.bukku.my",
  "headers": {
    "Authorization": "Bearer $API_SECRET",
    "Company-Subdomain": "$COMPANY_SUBDOMAIN",
    "Accept": "application/json"
  }
}
EOF

install -m 0644 "$ROOT_DIR/examples/bukku.example.json" "$TARGET_SECRETS_DIR/bukku.example.json"

echo
echo "Bukku bundle installed."
echo "Workspace: $TARGET_WORKSPACE"
echo "Skill: $TARGET_SKILLS_DIR/SKILL.md"
echo "Scripts: $TARGET_SCRIPTS_DIR/bukku-cli.mjs , $TARGET_SCRIPTS_DIR/_bukku.js"
echo "Secret written: $TARGET_SECRET_FILE"
echo
echo "Quick test:"
echo "node \"$TARGET_SCRIPTS_DIR/bukku-cli.mjs\" list-invoices --query 'page_size=2'"
