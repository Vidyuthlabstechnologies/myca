# Android upload key for tagged builds. Terraform makes empty secrets; the owner adds each
# value once in the console (Secret Manager > secret > New version), so no key passes through
# GitHub or Terraform state. Only the CI deploy identity can read them, and only from main or v* tags.
locals {
  release_secrets = toset([
    "myca-android-keystore-base64",
    "myca-android-keystore-password",
    "myca-android-key-alias",
    "myca-android-key-password",
  ])
}

resource "google_secret_manager_secret" "release" {
  for_each = local.release_secrets

  secret_id = each.value
  labels    = merge(local.labels, { component = "release" })

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "release_deployer" {
  for_each = var.deployer_service_account == "" ? toset([]) : local.release_secrets

  secret_id = google_secret_manager_secret.release[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.deployer_service_account}"
}
