provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  name = "myca-api"
  labels = {
    app        = "myca"
    component  = "api"
    managed_by = "terraform"
  }
  apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "iam.googleapis.com",
    "cloudscheduler.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "api" {
  repository_id = local.name
  location      = var.region
  format        = "DOCKER"
  description   = "MyCA API images"
  labels        = local.labels

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "api" {
  account_id   = local.name
  display_name = "MyCA API (Cloud Run)"
}

resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# ---------------------------------------------------------------------------
# Database: Postgres in Mumbai, daily backups kept 14 days, point-in-time recovery
# ---------------------------------------------------------------------------
resource "google_sql_database_instance" "main" {
  name                = "myca"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE"
    availability_type = var.sql_availability_type
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true
    user_labels       = local.labels

    backup_configuration {
      enabled                        = true
      start_time                     = "20:30"
      location                       = var.region
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    maintenance_window {
      day  = 7
      hour = 21
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = false
      record_client_address   = false
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "main" {
  name     = "myca"
  instance = google_sql_database_instance.main.name
}

resource "random_password" "db" {
  length  = 40
  special = false
}

resource "google_sql_user" "api" {
  name     = "myca"
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
}

# ---------------------------------------------------------------------------
# Secrets: generated here, read by the service only
# ---------------------------------------------------------------------------
resource "random_password" "token_secret" {
  length  = 64
  special = false
}

resource "random_password" "job_token" {
  length  = 64
  special = false
}

resource "random_password" "inbound_relay_token" {
  length  = 64
  special = false
}

resource "random_password" "whatsapp_verify_token" {
  length  = 48
  special = false
}

locals {
  database_url = "postgres://${google_sql_user.api.name}:${random_password.db.result}@localhost/${google_sql_database.main.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  secrets = {
    "myca-database-url"          = local.database_url
    "myca-token-secret"          = random_password.token_secret.result
    "myca-job-token"             = random_password.job_token.result
    "myca-inbound-relay-token"   = random_password.inbound_relay_token.result
    "myca-whatsapp-verify-token" = random_password.whatsapp_verify_token.result
    "myca-whatsapp-app-secret"   = var.whatsapp_app_secret
    "myca-whatsapp-access-token" = var.whatsapp_access_token
  }
}

resource "google_secret_manager_secret" "api" {
  for_each = local.secrets

  secret_id = each.key
  labels    = local.labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "api" {
  for_each = local.secrets

  secret      = google_secret_manager_secret.api[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each = local.secrets

  secret_id = google_secret_manager_secret.api[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

# ---------------------------------------------------------------------------
# The API on Cloud Run
# ---------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "api" {
  name                = local.name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account                  = google_service_account.api.email
    max_instance_request_concurrency = 40
    timeout                          = "60s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name = "MYCA_DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api["myca-database-url"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "MYCA_TOKEN_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api["myca-token-secret"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "MYCA_GOOGLE_CLIENT_IDS"
        value = join(",", var.google_client_ids)
      }

      env {
        name = "MYCA_JOB_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api["myca-job-token"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "MYCA_INBOUND_EMAIL_DOMAIN"
        value = var.inbound_email_domain
      }

      env {
        name = "MYCA_WHATSAPP_VERIFY_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api["myca-whatsapp-verify-token"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "MYCA_WHATSAPP_APP_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api["myca-whatsapp-app-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "MYCA_WHATSAPP_ACCESS_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api["myca-whatsapp-access-token"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "MYCA_WHATSAPP_PHONE_NUMBER_ID"
        value = var.whatsapp_phone_number_id
      }
      env {
        name = "MYCA_INBOUND_RELAY_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api["myca-inbound-relay-token"].secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      startup_probe {
        initial_delay_seconds = 2
        period_seconds        = 5
        failure_threshold     = 12
        timeout_seconds       = 3
        http_get {
          path = "/v1/health"
        }
      }

      liveness_probe {
        period_seconds    = 30
        failure_threshold = 3
        timeout_seconds   = 3
        http_get {
          path = "/v1/health"
        }
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.api,
    google_secret_manager_secret_version.api,
    google_project_iam_member.api_sql,
  ]
}

# ---------------------------------------------------------------------------
# The daily job: every business gets its reminders, chain check and rules check
# overnight, whether or not anyone opens the app.
resource "google_cloud_scheduler_job" "daily" {
  name             = "${local.name}-daily"
  region           = var.region
  description      = "Runs MyCA's daily checks for every business"
  schedule         = var.daily_job_schedule
  time_zone        = var.daily_job_time_zone
  attempt_deadline = "600s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "60s"
    max_backoff_duration = "600s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/v1/jobs/daily"
    headers = {
      "x-myca-job-token" = random_password.job_token.result
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------------------------
# Monitoring: uptime, server errors, latency
# ---------------------------------------------------------------------------
resource "google_monitoring_uptime_check_config" "api" {
  display_name = "MyCA API health"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/v1/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(google_cloud_run_v2_service.api.uri, "https://")
    }
  }

  selected_regions = ["ASIA_PACIFIC", "EUROPE", "USA_OREGON"]
}

resource "google_monitoring_notification_channel" "email" {
  count = var.alert_email != "" ? 1 : 0

  display_name = "MyCA API alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

locals {
  alert_channels = google_monitoring_notification_channel.email[*].id
  run_filter     = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${local.name}\""
}

resource "google_monitoring_alert_policy" "down" {
  count = var.alert_email != "" ? 1 : 0

  display_name = "MyCA API is down"
  combiner     = "OR"

  conditions {
    display_name = "Health check failing"
    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.api.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      duration        = "600s"
      threshold_value = 1
      trigger {
        count = 1
      }
      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
    }
  }

  notification_channels = local.alert_channels
}

resource "google_monitoring_alert_policy" "errors" {
  count = var.alert_email != "" ? 1 : 0

  display_name = "MyCA API is returning server errors"
  combiner     = "OR"

  conditions {
    display_name = "5xx responses"
    condition_threshold {
      filter          = "${local.run_filter} AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      duration        = "300s"
      threshold_value = 5
      trigger {
        count = 1
      }
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = local.alert_channels
}

resource "google_monitoring_alert_policy" "latency" {
  count = var.alert_email != "" ? 1 : 0

  display_name = "MyCA API is slow"
  combiner     = "OR"

  conditions {
    display_name = "95th percentile latency above 3 seconds"
    condition_threshold {
      filter          = "${local.run_filter} AND metric.type = \"run.googleapis.com/request_latencies\""
      comparison      = "COMPARISON_GT"
      duration        = "600s"
      threshold_value = 3000
      trigger {
        count = 1
      }
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MAX"
      }
    }
  }

  notification_channels = local.alert_channels
}
