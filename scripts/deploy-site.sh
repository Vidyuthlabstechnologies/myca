#!/usr/bin/env bash
# Publishes deploy/public to Firebase Hosting through the REST API with the caller's gcloud credentials.
# Usage: scripts/deploy-site.sh <site-id> [public-dir]
set -euo pipefail
site="$1"
public="${2:-deploy/public}"
api="https://firebasehosting.googleapis.com/v1beta1"
token="$(gcloud auth print-access-token)"
project="$(gcloud config get-value project 2>/dev/null || true)"
call() {
  local method="$1" url="$2" body="${3:-}"
  curl -fsS -X "$method" "$url" -H "Authorization: Bearer $token" ${project:+-H "x-goog-user-project: $project"} -H "Content-Type: application/json" ${body:+-d "$body"}
}
config='{"config":{"cleanUrls":true,"trailingSlashBehavior":"REMOVE","headers":[{"glob":"**","headers":{"Cache-Control":"public, max-age=300, must-revalidate","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","Strict-Transport-Security":"max-age=31536000"}}]}}'
version="$(call POST "$api/sites/$site/versions" "$config" | jq -r .name)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
manifest="{}"
while IFS= read -r -d '' file; do
  rel="/${file#"$public"/}"
  hash="$(gzip -9cn "$file" | tee "$work/blob" | sha256sum | cut -d' ' -f1)"
  mv "$work/blob" "$work/$hash"
  manifest="$(jq --arg p "$rel" --arg h "$hash" '. + {($p): $h}' <<<"$manifest")"
done < <(find "$public" -type f -print0)
populated="$(call POST "$api/$version:populateFiles" "$(jq -c '{files: .}' <<<"$manifest")")"
upload_url="$(jq -r .uploadUrl <<<"$populated")"
for hash in $(jq -r '.uploadRequiredHashes[]?' <<<"$populated"); do
  curl -fsS -X POST "$upload_url/$hash" -H "Authorization: Bearer $token" ${project:+-H "x-goog-user-project: $project"} -H "Content-Type: application/octet-stream" --data-binary "@$work/$hash" >/dev/null
done
call PATCH "$api/$version?update_mask=status" '{"status":"FINALIZED"}' >/dev/null
call POST "$api/sites/$site/releases?versionName=$version" '{}' | jq -r '"released " + .version.name'
