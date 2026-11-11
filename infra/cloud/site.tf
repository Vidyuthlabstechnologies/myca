# The marketing site, privacy policy (/privacy) and account-deletion page (/delete-account):
# deploy/public in an nginx container on Cloud Run, scaled to zero when idle, so no load balancer.
resource "google_cloud_run_v2_service" "site" {
  count = local.is_production ? 1 : 0

  name                = "myca-site"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = merge(local.labels, { component = "site" })

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  template {
    max_instance_request_concurrency = 80
    timeout                          = "10s"

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.site_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "128Mi"
        }
        cpu_idle = true
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "site_public" {
  count = local.is_production ? 1 : 0

  name     = google_cloud_run_v2_service.site[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "deployer_site_rollout" {
  count = local.is_production && var.deployer_service_account != "" ? 1 : 0

  name     = google_cloud_run_v2_service.site[0].name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${var.deployer_service_account}"
}

moved {
  from = google_cloud_run_v2_service.site
  to   = google_cloud_run_v2_service.site[0]
}

moved {
  from = google_cloud_run_v2_service_iam_member.site_public
  to   = google_cloud_run_v2_service_iam_member.site_public[0]
}
