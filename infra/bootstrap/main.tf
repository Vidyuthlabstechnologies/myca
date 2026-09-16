# MyCA — one-time GCP bootstrap (run by the GCP account owner)
#
# Creates: required APIs, Terraform state bucket, GitHub Workload Identity
# Federation (keyless), and the CI deploy service account + its roles.
# Nothing secret is stored: GitHub authenticates with short-lived OIDC tokens.

locals {
  state_bucket = var.state_bucket_name != "" ? var.state_bucket_name : "${var.project_id}-myca-tfstate"
  deploy_sa    = "${var.deploy_service_account_id}@${var.project_id}.iam.gserviceaccount.com"

  # GitHub's OIDC subject constraints. Restrict to the repo (and optionally a ref).
  wif_condition = var.github_branch_restriction != "" ? join(" && ", [
    "assertion.repository == \"${var.github_repository}\"",
    "assertion.ref == \"${var.github_branch_restriction}\"",
  ]) : "assertion.repository == \"${var.github_repository}\""

  required_apis = [
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com",
    "compute.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "dns.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "certificatemanager.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
  ]

  # Project roles the CI deployer needs to manage the app infra (root module).
  deployer_roles = [
    "roles/browser",
    "roles/storage.admin",
    "roles/compute.networkAdmin",
    "roles/compute.loadBalancerAdmin",
    "roles/artifactregistry.admin",
    "roles/monitoring.admin",
    "roles/dns.admin",
    "roles/secretmanager.admin",
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/serviceusage.serviceUsageViewer",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "tf_state" {
  project                     = var.project_id
  name                        = local.state_bucket
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 10
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------------------
# Keyless GitHub -> GCP authentication (Workload Identity Federation)
# ---------------------------------------------------------------------------
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "OIDC pool for GitHub Actions deploys."

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = local.wif_condition

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  depends_on = [google_iam_workload_identity_pool.github]
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = var.deploy_service_account_id
  display_name = "MyCA GitHub Actions deployer"

  depends_on = [google_project_service.apis]
}

# Allow the repo's Actions runs to impersonate the deployer SA.
resource "google_service_account_iam_member" "wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "deployer" {
  for_each = toset(local.deployer_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
