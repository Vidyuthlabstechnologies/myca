output "api_url" {
  description = "Base URL of the API. Build the app with --dart-define=MYCA_CLOUD_URL=<this>."
  value       = google_cloud_run_v2_service.api.uri
}

output "image_repository" {
  description = "Push API images here."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.api.repository_id}"
}

output "database_connection_name" {
  description = "Cloud SQL connection name, for the Auth Proxy during a restore drill."
  value       = google_sql_database_instance.main.connection_name
}

output "inbound_relay_token" {
  description = "Set this as INBOUND_RELAY_TOKEN on the email relay Worker (wrangler secret put)."
  value       = random_password.inbound_relay_token.result
  sensitive   = true
}
