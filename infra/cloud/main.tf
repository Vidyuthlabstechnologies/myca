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
    "pubsub.googleapis.com",
    "androidpublisher.googleapis.com",
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

  condition {
    title      = "myca-instance-only"
    expression = "resource.type == \"sqladmin.googleapis.com/Instance\" && resource.name == \"projects/${var.project_id}/instances/myca\""
  }
}

# ---------------------------------------------------------------------------
# Document vault: uploaded files by sha256, one prefix per business
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "documents" {
  name                        = "${var.project_id}-myca-documents"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = !var.deletion_protection
  labels                      = local.labels

  versioning {
    enabled = false
  }

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "api_documents" {
  bucket = google_storage_bucket.documents.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.api.email}"
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

    database_flags {
      name  = "cloudsql.enable_pgaudit"
      value = "on"
    }

    database_flags {
      name  = "pgaudit.log"
      value = "read,write"
    }

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

resource "random_password" "play_notify_token" {
  length  = 48
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

resource "random_password" "connector_key" {
  length  = 64
  special = false
}

resource "random_password" "books_key" {
  length  = 64
  special = false
}

resource "random_password" "waha_webhook_secret" {
  length  = 48
  special = false
}

locals {
  database_url = "postgres://${google_sql_user.api.name}:${random_password.db.result}@localhost/${google_sql_database.main.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  given        = { for name, value in var.carried_secrets : name => value if nonsensitive(trimspace(value) != "") }
  generated = {
    MYCA_TOKEN_SECRET          = random_password.token_secret.result
    MYCA_BOOKS_KEY             = random_password.books_key.result
    MYCA_CONNECTOR_KEY         = random_password.connector_key.result
    MYCA_JOB_TOKEN             = random_password.job_token.result
    MYCA_INBOUND_RELAY_TOKEN   = random_password.inbound_relay_token.result
    MYCA_WHATSAPP_VERIFY_TOKEN = random_password.whatsapp_verify_token.result
    MYCA_PLAY_NOTIFY_TOKEN     = random_password.play_notify_token.result
    MYCA_WAHA_WEBHOOK_SECRET   = random_password.waha_webhook_secret.result
  }
  optional_secrets = { for name, value in {
    MYCA_MODEL_API_KEY             = var.model_api_key
    NVIDIA_NIM_API_KEY             = var.model_api_key
    MYCA_WAHA_API_KEY              = var.waha_api_key
    MYCA_WHATSAPP_APP_SECRET       = var.whatsapp_app_secret
    MYCA_WHATSAPP_ACCESS_TOKEN     = var.whatsapp_access_token
    MYCA_SMS_TWILIO_TOKEN          = var.sms_provider == "twilio" ? var.sms_secret : ""
    MYCA_SMS_MSG91_AUTHKEY         = var.sms_provider == "msg91" ? var.sms_secret : ""
    MYCA_EMAIL_RELAY_TOKEN         = var.email_relay_token
    MYCA_GSP_TEST_API_KEY          = var.gsp_test_api_key
    MYCA_GSP_TEST_API_SECRET       = var.gsp_test_api_secret
    MYCA_GSP_API_KEY               = var.gsp_api_key
    MYCA_GSP_API_SECRET            = var.gsp_api_secret
    MYCA_PLAY_SERVICE_ACCOUNT_JSON = var.play_service_account_json
  } : name => value if nonsensitive(!contains(["", "unset"], trimspace(value))) }
  secrets      = merge(local.generated, local.given, { MYCA_DATABASE_URL = local.database_url }, local.optional_secrets)
  secret_names = sort(nonsensitive(keys(local.secrets)))
  environment = { for name, value in {
    TZ                             = "Asia/Kolkata"
    MYCA_GOOGLE_CLIENT_IDS         = join(",", var.google_client_ids)
    MYCA_OIDC_ISSUER               = var.oidc_issuer
    MYCA_OIDC_CLIENT_IDS           = join(",", var.oidc_client_ids)
    MYCA_DOCUMENT_BUCKET           = google_storage_bucket.documents.name
    MYCA_ENABLE_CHANNEL_PULLS      = var.enable_channel_pulls ? "1" : "0"
    MYCA_INBOUND_EMAIL_DOMAIN      = var.inbound_email_domain
    MYCA_WHATSAPP_PROVIDER         = var.waha_url != "" ? "waha" : ""
    MYCA_WAHA_URL                  = var.waha_url
    MYCA_WAHA_SESSION              = var.waha_url != "" ? var.waha_session : ""
    MYCA_WHATSAPP_PHONE_NUMBER_ID  = var.whatsapp_phone_number_id == "unset" ? "" : var.whatsapp_phone_number_id
    MYCA_MOCK_MODE                 = var.provider_mode == "simulated" ? "1" : "0"
    MYCA_PROVIDER_ENV              = contains(["live", "test"], var.provider_mode) ? var.provider_mode : "off"
    MYCA_GSP_ENV                   = var.gsp_environment
    MYCA_PUBLIC_URL                = var.public_url
    MYCA_SMS_PROVIDER              = var.sms_provider
    MYCA_SMS_TWILIO_SID            = var.sms_twilio_sid
    MYCA_SMS_TWILIO_FROM           = var.sms_twilio_from
    MYCA_SMS_MSG91_TEMPLATE_ID     = var.sms_msg91_template_id
    MYCA_EMAIL_RELAY_URL           = var.email_relay_url
    MYCA_EMAIL_FROM                = var.email_from
    MYCA_MODEL                     = var.model_name
    NVIDIA_NIM_MODEL               = var.model_name
    MYCA_MODEL_BASE_URL            = var.model_base_url
    MYCA_PLAY_PACKAGE              = var.play_package_name
    MYCA_PLAY_PRODUCT_ESSENTIALS   = var.play_product_essentials
    MYCA_PLAY_PRODUCT_PRO          = var.play_product_pro
    MYCA_PLAY_PRODUCT_FIRM         = var.play_product_firm
    MYCA_PLAN_PRICES               = var.plan_prices
    MYCA_ENVIRONMENT               = "production"
    MYCA_PLAY_PUSH_AUDIENCE        = local.play_push_audience
    MYCA_PLAY_PUSH_SERVICE_ACCOUNT = google_service_account.play_push.email
    MYCA_ADMIN_USER_IDS            = join(",", var.admin_user_ids)
    MYCA_OTP_GLOBAL_PER_HOUR       = var.otp_global_per_hour == null ? "" : tostring(var.otp_global_per_hour)
  } : name => value if value != "" }
  play_push_audience = "myca-play-notifications"
}

resource "google_secret_manager_secret" "api" {
  for_each = toset(local.secret_names)

  secret_id = replace(lower(each.key), "_", "-")
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
  for_each = toset(local.secret_names)

  secret      = google_secret_manager_secret.api[each.key].id
  secret_data = local.secrets[each.key]
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each = toset(local.secret_names)

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

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

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

      dynamic "env" {
        for_each = local.environment
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = toset(local.secret_names)
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.api[env.value].secret_id
              version = "latest"
            }
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
          path = "/v1/health/live"
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
      "x-myca-job-token" = local.secrets["MYCA_JOB_TOKEN"]
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_scheduler_job" "weekly" {
  name             = "${local.name}-weekly"
  region           = var.region
  description      = "Sends MyCA's Monday brief on WhatsApp to members who asked for it"
  schedule         = var.weekly_job_schedule
  time_zone        = var.daily_job_time_zone
  attempt_deadline = "600s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "60s"
    max_backoff_duration = "600s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/v1/jobs/weekly"
    headers = {
      "x-myca-job-token" = local.secrets["MYCA_JOB_TOKEN"]
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

resource "google_logging_project_bucket_config" "myca" {
  project        = var.project_id
  location       = "global"
  bucket_id      = "${local.name}-logs"
  retention_days = var.log_retention_days
  description    = "MyCA request, job and database logs kept for the CERT-In period"
}

resource "google_logging_project_sink" "myca" {
  name                   = "${local.name}-logs"
  destination            = "logging.googleapis.com/${google_logging_project_bucket_config.myca.id}"
  unique_writer_identity = true
  filter                 = "(resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.name}\") OR (resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:myca\") OR (resource.type=\"cloud_scheduler_job\" AND resource.labels.job_id=~\"^${local.name}\")"
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  count = var.deployer_service_account == "" ? 0 : 1

  location   = google_artifact_registry_repository.api.location
  repository = google_artifact_registry_repository.api.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${var.deployer_service_account}"
}

resource "google_cloud_run_v2_service_iam_member" "deployer_rollout" {
  count = var.deployer_service_account == "" ? 0 : 1

  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.developer"
  member   = "serviceAccount:${var.deployer_service_account}"
}

resource "google_service_account_iam_member" "deployer_act_as_api" {
  count = var.deployer_service_account == "" ? 0 : 1

  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.deployer_service_account}"
}

resource "google_pubsub_topic" "play_notifications" {
  name   = "${local.name}-play-notifications"
  labels = local.labels

  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic_iam_member" "play_publisher" {
  topic  = google_pubsub_topic.play_notifications.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:google-play-developer-notifications@system.gserviceaccount.com"
}

resource "google_service_account" "play_push" {
  account_id   = "myca-play-push"
  display_name = "Signs Pub/Sub pushes of Play notifications to the MyCA API"
}

data "google_project" "this" {}

resource "google_service_account_iam_member" "pubsub_signs_play_push" {
  service_account_id = google_service_account.play_push.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription" "play_notifications" {
  name   = "${local.name}-play-notifications-push"
  topic  = google_pubsub_topic.play_notifications.id
  labels = local.labels

  ack_deadline_seconds       = 30
  message_retention_duration = "604800s"

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.api.uri}/v1/billing/play/notify"

    oidc_token {
      service_account_email = google_service_account.play_push.email
      audience              = local.play_push_audience
    }
  }

  depends_on = [google_service_account_iam_member.pubsub_signs_play_push]

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}
