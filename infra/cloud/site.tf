# The marketing site, privacy policy and account-deletion page on Firebase Hosting:
# free at this size, HTTPS and a global CDN included, no load balancer to pay for.
resource "google_project_service" "firebase" {
  for_each = toset(["firebase.googleapis.com", "firebasehosting.googleapis.com"])

  service            = each.value
  disable_on_destroy = false
}

resource "google_firebase_project" "main" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.firebase]
}

resource "google_firebase_hosting_site" "main" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.site_id != "" ? var.site_id : var.project_id

  depends_on = [google_firebase_project.main]
}

resource "google_project_iam_member" "deployer_hosting" {
  count = var.deployer_service_account == "" ? 0 : 1

  project = var.project_id
  role    = "roles/firebasehosting.admin"
  member  = "serviceAccount:${var.deployer_service_account}"
}

resource "google_project_iam_member" "deployer_api_keys_viewer" {
  count = var.deployer_service_account == "" ? 0 : 1

  project = var.project_id
  role    = "roles/serviceusage.apiKeysViewer"
  member  = "serviceAccount:${var.deployer_service_account}"
}
