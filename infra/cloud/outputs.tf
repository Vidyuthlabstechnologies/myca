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

output "documents_bucket" {
  description = "Cloud Storage bucket holding uploaded documents by sha256 (MYCA_DOCUMENT_BUCKET)."
  value       = google_storage_bucket.documents.name
}

output "inbound_relay_token" {
  description = "Set this as INBOUND_RELAY_TOKEN on the email relay Worker (wrangler secret put)."
  value       = random_password.inbound_relay_token.result
  sensitive   = true
}

output "whatsapp_verify_token" {
  description = "Paste this as the webhook verify token in the Meta app's WhatsApp configuration; the callback URL is <service url>/v1/whatsapp/webhook."
  value       = random_password.whatsapp_verify_token.result
  sensitive   = true
}

output "play_notifications_topic" {
  description = "Paste this in Play Console > Monetize > Monetization setup > Real-time developer notifications."
  value       = google_pubsub_topic.play_notifications.id
}

output "api_service_account" {
  description = "Invite this email in Play Console > Users and permissions with View financial data and Manage orders and subscriptions, so the API can check purchases."
  value       = google_service_account.api.email
}
