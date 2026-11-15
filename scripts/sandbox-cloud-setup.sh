#!/usr/bin/env bash
set -euo pipefail

PROJECT="${PROJECT:-myca-prod-in}"
REGION="${REGION:-asia-south1}"
SERVICE=myca-sandbox
REPOSITORY_ID=1372309435
POOL=myca-github-sandbox
RUN_SA="myca-sandbox-run@${PROJECT}.iam.gserviceaccount.com"
DEPLOY_SA="myca-sandbox-deployer@${PROJECT}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${SERVICE}/myca-sandbox:$(git rev-parse --short HEAD)"

say() { printf '\n== %s\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }

[ -f scripts/sandbox-server.mjs ] || { echo "Run this from the root of the myca repository (git clone, then cd myca)."; exit 1; }
gcloud config set project "$PROJECT" >/dev/null
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"

say "Turning on the APIs the sandbox needs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --quiet

say "Image registry ${SERVICE}"
exists gcloud artifacts repositories describe "$SERVICE" --location "$REGION" || gcloud artifacts repositories create "$SERVICE" --location "$REGION" --repository-format docker --description "MyCA sandbox images (test data only)" --quiet

say "Service accounts"
exists gcloud iam service-accounts describe "$RUN_SA" || gcloud iam service-accounts create myca-sandbox-run --display-name "MyCA sandbox (runs the service)" --quiet
exists gcloud iam service-accounts describe "$DEPLOY_SA" || gcloud iam service-accounts create myca-sandbox-deployer --display-name "MyCA sandbox (GitHub deploys from develop)" --quiet

secret() {
  local name="$1" value="$2"
  if ! exists gcloud secrets describe "$name"; then
    printf '%s' "$value" | gcloud secrets create "$name" --replication-policy automatic --data-file=- --quiet
  elif [ "${3:-}" = "replace" ] && [ -n "$value" ]; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet
  fi
  gcloud secrets add-iam-policy-binding "$name" --member "serviceAccount:${RUN_SA}" --role roles/secretmanager.secretAccessor --quiet >/dev/null
}

say "Secrets (sandbox only)"
secret myca-sandbox-seed "$(openssl rand -hex 32)"
secret myca-sandbox-console-key "$(openssl rand -hex 10)"
MODEL_KEY="${MYCA_MODEL_API_KEY:-}"
if [ -z "$MODEL_KEY" ] && ! exists gcloud secrets describe myca-sandbox-model-key; then
  read -r -s -p "Anthropic API key for AI chat (starts sk-ant-; Enter to skip): " MODEL_KEY; echo
fi
SECRETS="MYCA_SANDBOX_SEED=myca-sandbox-seed:latest,MYCA_SANDBOX_CONSOLE_KEY=myca-sandbox-console-key:latest"
if [ -n "$MODEL_KEY" ] || exists gcloud secrets describe myca-sandbox-model-key; then
  secret myca-sandbox-model-key "$MODEL_KEY" replace
  SECRETS="${SECRETS},MYCA_MODEL_API_KEY=myca-sandbox-model-key:latest"
fi

build_local() {
  say "Building the image in Cloud Shell and pushing ${IMAGE}"
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null
  docker build -f deploy/sandbox/Dockerfile -t "$IMAGE" .
  docker push "$IMAGE"
}
build_cloud() {
  say "Building the image with Cloud Build (a few minutes, nothing is downloaded to Cloud Shell)"
  gcloud services enable cloudbuild.googleapis.com --quiet
  for builder in "${NUMBER}@cloudbuild.gserviceaccount.com" "${NUMBER}-compute@developer.gserviceaccount.com"; do
    gcloud artifacts repositories add-iam-policy-binding "$SERVICE" --location "$REGION" --member "serviceAccount:${builder}" --role roles/artifactregistry.writer --quiet >/dev/null 2>&1 || true
  done
  gcloud builds submit . --region "$REGION" --config deploy/sandbox/cloudbuild.yaml --ignore-file deploy/sandbox/gcloudignore \
    --substitutions "_IMAGE=${IMAGE}" --quiet
}
if [ "${BUILD:-cloud}" = local ]; then
  build_local
elif ! build_cloud; then
  echo "Cloud Build did not finish; building in Cloud Shell instead."
  build_local
fi

deploy() {
  gcloud run deploy "$SERVICE" --region "$REGION" --image "$IMAGE" --service-account "$RUN_SA" \
    --allow-unauthenticated --min-instances 1 --max-instances 1 --cpu 1 --memory 1Gi --cpu-throttling --timeout 300 \
    --set-secrets "$SECRETS" --set-env-vars "MYCA_SANDBOX_PUBLIC_URL=$1" --quiet
}
say "Deploying the Cloud Run service ${SERVICE} (production is not touched)"
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
deploy "${URL:-http://127.0.0.1:8080}"
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
LEGACY="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='json' | grep -o "https://${SERVICE}-[a-z0-9]*-[a-z]*\.a\.run\.app" | head -1 || true)"
PUBLIC="${LEGACY:-$URL}"
deploy "$PUBLIC"

say "Letting GitHub redeploy the sandbox from develop (its own pool: it cannot reach production)"
exists gcloud iam workload-identity-pools describe "$POOL" --location global || gcloud iam workload-identity-pools create "$POOL" --location global --display-name "GitHub develop (sandbox only)" --quiet
exists gcloud iam workload-identity-pools providers describe develop --location global --workload-identity-pool "$POOL" || \
  gcloud iam workload-identity-pools providers create-oidc develop --location global --workload-identity-pool "$POOL" \
    --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository_id == '${REPOSITORY_ID}' && assertion.ref == 'refs/heads/develop'" --quiet
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository_id/${REPOSITORY_ID}" --quiet >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$SERVICE" --location "$REGION" --member "serviceAccount:${DEPLOY_SA}" --role roles/artifactregistry.writer --quiet >/dev/null
gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" --member "serviceAccount:${DEPLOY_SA}" --role roles/run.developer --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" --member "serviceAccount:${DEPLOY_SA}" --role roles/iam.serviceAccountUser --quiet >/dev/null

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$PUBLIC/in/v1/health/live" >/dev/null && curl -fsS "$PUBLIC/us/v1/health/live" >/dev/null; then break; fi
  sleep 6
done
CONSOLE_KEY="$(gcloud secrets versions access latest --secret myca-sandbox-console-key)"
say "Done"
echo "Sandbox:  ${PUBLIC}"
echo "Health:   $(curl -fsS "$PUBLIC/in/v1/health/live" || echo 'not answering yet')"
echo "Console:  ${PUBLIC}/?k=${CONSOLE_KEY}   (open once on the phone)"
echo "GitHub deploys develop here with provider projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/develop and ${DEPLOY_SA}."
