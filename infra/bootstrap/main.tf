# MyCA — one-time GCP bootstrap (run by the GCP account owner)
#
# Creates: required APIs, the Terraform state bucket, two GitHub Workload
# Identity Federation pools (deploy and PR plan), the CI deployer and planner
# service accounts, and their roles. Nothing secret is stored: GitHub
# authenticates with short-lived OIDC tokens.

locals {
  state_bucket     = var.state_bucket_name != "" ? var.state_bucket_name : "${var.project_id}-myca-tfstate"
  site_bucket      = var.site_bucket_name != "" ? var.site_bucket_name : "${var.project_id}-myca-site"
  artifacts_bucket = var.artifacts_bucket_name != "" ? var.artifacts_bucket_name : "${var.project_id}-myca-artifacts"
  downloads_bucket = var.downloads_bucket_name != "" ? var.downloads_bucket_name : "${var.project_id}-myca-downloads"

  app_buckets = {
    site      = local.site_bucket
    artifacts = local.artifacts_bucket
    downloads = local.downloads_bucket
  }

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

  deployer_roles = [
    "roles/browser",
    "roles/serviceusage.serviceUsageViewer",
  ]

  site_deployer_roles = var.manage_site ? [
    "roles/compute.networkAdmin",
    "roles/compute.loadBalancerAdmin",
    "roles/artifactregistry.admin",
    "roles/monitoring.admin",
    "roles/dns.admin",
  ] : []

  planner_roles = [
    "roles/browser",
    "roles/compute.viewer",
    "roles/dns.reader",
    "roles/monitoring.viewer",
    "roles/artifactregistry.reader",
    "roles/storage.bucketViewer",
    "roles/iam.securityReviewer",
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
  workload_identity_pool_id = var.pool_id
  display_name              = "GitHub Actions deploy"
  description               = "OIDC pool for GitHub Actions runs on main and v* tags."

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.pool_id
  display_name                       = "GitHub OIDC (deploy)"

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.actor"         = "assertion.actor"
    "attribute.repository"    = "assertion.repository"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
  }

  attribute_condition = "assertion.repository_id == \"${var.github_repository_id}\" && (assertion.ref == \"refs/heads/main\" || assertion.ref.startsWith(\"refs/tags/v\"))"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_iam_workload_identity_pool" "github_plan" {
  project                   = var.project_id
  workload_identity_pool_id = "${var.pool_id}-plan"
  display_name              = "GitHub Actions PR plan"
  description               = "OIDC pool for read-only Terraform plans on pull requests."

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github_plan" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_plan.workload_identity_pool_id
  workload_identity_pool_provider_id = "${var.pool_id}-plan"
  display_name                       = "GitHub OIDC (PR plan)"

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.actor"         = "assertion.actor"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
  }

  attribute_condition = "assertion.repository_id == \"${var.github_repository_id}\" && assertion.event_name == \"pull_request\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ---------------------------------------------------------------------------
# CI deployer: main-branch and v* tag runs (Terraform apply, site deploy, releases)
# ---------------------------------------------------------------------------
resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = var.deploy_service_account_id
  display_name = "MyCA GitHub Actions deployer"

  depends_on = [google_project_service.apis]
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}

resource "google_project_iam_member" "deployer" {
  for_each = toset(concat(local.deployer_roles, local.site_deployer_roles))

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_custom_role" "bucket_creator" {
  count = var.manage_site ? 1 : 0

  project     = var.project_id
  role_id     = "mycaBucketCreator"
  title       = "MyCA bucket creator"
  description = "Create buckets only; access to each MyCA bucket is granted separately."
  permissions = ["storage.buckets.create"]
}

resource "google_project_iam_member" "deployer_bucket_creator" {
  count = var.manage_site ? 1 : 0

  project = var.project_id
  role    = google_project_iam_custom_role.bucket_creator[0].id
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_bucket_admin" {
  for_each = var.manage_site ? local.app_buckets : {}

  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"

  condition {
    title      = "myca-${each.key}-bucket-only"
    expression = "resource.name == \"projects/_/buckets/${each.value}\" || resource.name.startsWith(\"projects/_/buckets/${each.value}/\")"
  }
}

resource "google_storage_bucket_iam_member" "deployer_state" {
  bucket = google_storage_bucket.tf_state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"

  condition {
    title      = "root-state-only"
    expression = "resource.name == \"projects/_/buckets/${google_storage_bucket.tf_state.name}\" || resource.name.startsWith(\"projects/_/buckets/${google_storage_bucket.tf_state.name}/objects/root/\")"
  }
}

# ---------------------------------------------------------------------------
# CI planner: pull-request runs (read-only Terraform plan, no environment)
# ---------------------------------------------------------------------------
resource "google_service_account" "planner" {
  project      = var.project_id
  account_id   = var.plan_service_account_id
  display_name = "MyCA GitHub Actions PR planner (read-only)"

  depends_on = [google_project_service.apis]
}

resource "google_service_account_iam_member" "planner_wif" {
  service_account_id = google_service_account.planner.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_plan.name}/attribute.repository_id/${var.github_repository_id}"
}

resource "google_project_iam_member" "planner" {
  for_each = toset(local.planner_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.planner.email}"
}

resource "google_storage_bucket_iam_member" "planner_state" {
  bucket = google_storage_bucket.tf_state.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.planner.email}"

  condition {
    title      = "root-state-read-only"
    expression = "resource.name == \"projects/_/buckets/${google_storage_bucket.tf_state.name}\" || resource.name.startsWith(\"projects/_/buckets/${google_storage_bucket.tf_state.name}/objects/root/\")"
  }
}
