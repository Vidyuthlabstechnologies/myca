output "site_bucket" {
  description = "GCS bucket holding the static site (GitHub variable GCP_SITE_BUCKET)."
  value       = google_storage_bucket.site.name
}

output "artifacts_bucket" {
  description = "GCS bucket for release installers (GitHub variable GCP_ARTIFACTS_BUCKET)."
  value       = google_storage_bucket.artifacts.name
}

output "url_map_name" {
  description = "URL map name for CDN cache invalidation (GitHub variable GCP_URL_MAP)."
  value       = google_compute_url_map.site.name
}

output "load_balancer_ip" {
  description = "Global anycast IP of the site load balancer."
  value       = google_compute_global_address.site.address
}

output "site_url" {
  description = "Primary site URL."
  value       = local.use_domain ? "https://${local.domain}" : "http://${google_compute_global_address.site.address}"
}

output "dns_nameservers" {
  description = "Point your registrar's NS records here if manage_dns = true."
  value       = local.use_dns ? google_dns_managed_zone.site[0].name_servers : []
}

output "artifact_registry_repo" {
  description = "Docker image prefix for future backend services."
  value       = var.create_artifact_registry ? "${var.region}-docker.pkg.dev/${var.project_id}/myca" : ""
}
