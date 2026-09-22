provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  site_bucket      = var.site_bucket_name != "" ? var.site_bucket_name : "${var.project_id}-myca-site"
  artifacts_bucket = var.artifacts_bucket_name != "" ? var.artifacts_bucket_name : "${var.project_id}-myca-artifacts"
  downloads_bucket = var.downloads_bucket_name != "" ? var.downloads_bucket_name : "${var.project_id}-myca-downloads"
  domain           = trimspace(var.domain_name)
  use_domain       = local.domain != ""
  domains          = local.use_domain ? [local.domain, "www.${local.domain}"] : []
  use_dns          = local.use_domain && var.manage_dns
  lb_name          = "myca-site-lb"

  labels = {
    app        = "myca"
    managed_by = "terraform"
  }
}

# ---------------------------------------------------------------------------
# Static site origin
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "site" {
  project = var.project_id
  name    = local.site_bucket
  # ASIA multi-region gives the CDN a fast, in-continent origin.
  location                    = "ASIA"
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false
  labels                      = local.labels

  website {
    main_page_suffix = "index.html"
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 5
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 7
    }
    action {
      type = "Delete"
    }
  }
}

# The site is public by design; the CDN/LB reads it as an anonymous client.
# Get only: anonymous callers cannot list objects or their older versions.
resource "google_storage_bucket_iam_member" "site_public" {
  bucket = google_storage_bucket.site.name
  role   = "roles/storage.legacyObjectReader"
  member = "allUsers"
}

# ---------------------------------------------------------------------------
# Release artifacts (private: installers are published via GitHub Releases)
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "artifacts" {
  project                     = var.project_id
  name                        = local.artifacts_bucket
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = local.labels

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_artifact_registry_repository" "docker" {
  count = var.create_artifact_registry ? 1 : 0

  project       = var.project_id
  location      = var.region
  repository_id = "myca"
  description   = "MyCA container images (future backend services)"
  format        = "DOCKER"
  labels        = local.labels
}

# ---------------------------------------------------------------------------
# Public download mirror for Windows installers (served at /downloads/*)
# Kept separate from the site bucket so site syncs never delete installers.
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "downloads" {
  project                     = var.project_id
  name                        = local.downloads_bucket
  location                    = "ASIA"
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false
  labels                      = local.labels

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Content-Disposition"]
    max_age_seconds = 3600
  }
}

resource "google_storage_bucket_iam_member" "downloads_public" {
  bucket = google_storage_bucket.downloads.name
  role   = "roles/storage.legacyObjectReader"
  member = "allUsers"
}

# ---------------------------------------------------------------------------
# Global external HTTPS load balancer + Cloud CDN
# ---------------------------------------------------------------------------
resource "google_compute_global_address" "site" {
  project = var.project_id
  name    = "${local.lb_name}-ip"
}

resource "google_compute_backend_bucket" "site" {
  project          = var.project_id
  name             = "myca-site-backend"
  bucket_name      = google_storage_bucket.site.name
  enable_cdn       = true
  compression_mode = "AUTOMATIC"

  custom_response_headers = [
    "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
  ]

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 3600
    client_ttl        = 3600
    max_ttl           = 86400
    negative_caching  = true
    serve_while_stale = 86400
  }

  depends_on = [google_storage_bucket_iam_member.site_public]
}

resource "google_compute_backend_bucket" "downloads" {
  project          = var.project_id
  name             = "myca-downloads-backend"
  bucket_name      = google_storage_bucket.downloads.name
  enable_cdn       = true
  compression_mode = "AUTOMATIC"

  cdn_policy {
    # The aliases change on every release; the publish job also purges /downloads/*.
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 300
    client_ttl        = 300
    max_ttl           = 3600
    negative_caching  = true
    serve_while_stale = 86400
  }

  depends_on = [google_storage_bucket_iam_member.downloads_public]
}

resource "google_compute_url_map" "site" {
  project = var.project_id
  name    = "${local.lb_name}-urlmap"

  # Everything not matched below is the static site.
  default_service = google_compute_backend_bucket.site.id

  host_rule {
    hosts        = ["*"]
    path_matcher = "site"
  }

  path_matcher {
    name            = "site"
    default_service = google_compute_backend_bucket.site.id

    path_rule {
      paths   = ["/downloads", "/downloads/*"]
      service = google_compute_backend_bucket.downloads.id
    }
  }
}

# HTTP -> HTTPS redirect (only meaningful once a domain + cert exist).
resource "google_compute_url_map" "redirect" {
  count = local.use_domain ? 1 : 0

  project = var.project_id
  name    = "${local.lb_name}-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_managed_ssl_certificate" "site" {
  count = local.use_domain ? 1 : 0

  project = var.project_id
  name    = "${local.lb_name}-cert-${substr(sha256(join(",", local.domains)), 0, 8)}"

  managed {
    domains = local.domains
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_target_https_proxy" "site" {
  count = local.use_domain ? 1 : 0

  project          = var.project_id
  name             = "${local.lb_name}-https-proxy"
  url_map          = google_compute_url_map.site.id
  ssl_certificates = [google_compute_managed_ssl_certificate.site[0].id]
  quic_override    = "ENABLE"
}

resource "google_compute_target_http_proxy" "site" {
  project = var.project_id
  name    = "${local.lb_name}-http-proxy"
  url_map = local.use_domain ? google_compute_url_map.redirect[0].id : google_compute_url_map.site.id
}

resource "google_compute_global_forwarding_rule" "http" {
  project    = var.project_id
  name       = "${local.lb_name}-http"
  target     = google_compute_target_http_proxy.site.id
  port_range = "80"
  ip_address = google_compute_global_address.site.address
}

resource "google_compute_global_forwarding_rule" "https" {
  count = local.use_domain ? 1 : 0

  project    = var.project_id
  name       = "${local.lb_name}-https"
  target     = google_compute_target_https_proxy.site[0].id
  port_range = "443"
  ip_address = google_compute_global_address.site.address
}

# ---------------------------------------------------------------------------
# DNS (optional)
# ---------------------------------------------------------------------------
resource "google_dns_managed_zone" "site" {
  count = local.use_dns ? 1 : 0

  project     = var.project_id
  name        = replace(local.domain, ".", "-")
  dns_name    = "${local.domain}."
  description = "MyCA site zone"
  labels      = local.labels
}

resource "google_dns_record_set" "apex" {
  count = local.use_dns ? 1 : 0

  project      = var.project_id
  name         = "${local.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.site[0].name
  rrdatas      = [google_compute_global_address.site.address]
}

resource "google_dns_record_set" "www" {
  count = local.use_dns ? 1 : 0

  project      = var.project_id
  name         = "www.${local.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.site[0].name
  rrdatas      = [google_compute_global_address.site.address]
}

# ---------------------------------------------------------------------------
# Monitoring
# ---------------------------------------------------------------------------
resource "google_monitoring_uptime_check_config" "site" {
  count = local.use_domain ? 1 : 0

  project      = var.project_id
  display_name = "MyCA site (${local.domain})"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.domain
    }
  }

  selected_regions = ["ASIA_PACIFIC", "USA_OREGON", "EUROPE"]
}

resource "google_monitoring_notification_channel" "email" {
  count = var.alert_email != "" ? 1 : 0

  project      = var.project_id
  display_name = "MyCA email alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  count = var.alert_email != "" && local.use_domain ? 1 : 0

  project      = var.project_id
  display_name = "MyCA site is down"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.site[0].uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      duration        = "300s"
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

  notification_channels = [google_monitoring_notification_channel.email[0].id]

  alert_strategy {
    auto_close = "1800s"
  }
}
