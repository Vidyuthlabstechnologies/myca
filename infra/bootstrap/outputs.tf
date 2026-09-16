output "tf_state_bucket" {
  description = "Bucket for Terraform remote state (paste into GitHub variable GCP_TF_STATE_BUCKET)."
  value       = google_storage_bucket.tf_state.name
}

output "workload_identity_provider" {
  description = "Full WIF provider name (paste into GitHub variable GCP_WIF_PROVIDER)."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account" {
  description = "Deployer SA email (paste into GitHub variable GCP_DEPLOY_SA)."
  value       = google_service_account.deployer.email
}

output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}
