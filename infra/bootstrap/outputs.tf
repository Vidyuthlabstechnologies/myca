output "tf_state_bucket" {
  description = "Bucket for Terraform remote state (paste into GitHub variable GCP_TF_STATE_BUCKET)."
  value       = google_storage_bucket.tf_state.name
}

output "workload_identity_provider" {
  description = "Deploy WIF provider, main and v* tags only (paste into GitHub variable GCP_WIF_PROVIDER)."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account" {
  description = "Deployer SA email (paste into GitHub variable GCP_DEPLOY_SA)."
  value       = google_service_account.deployer.email
}

output "plan_workload_identity_provider" {
  description = "PR plan WIF provider, pull_request events only (paste into GitHub variable GCP_WIF_PLAN_PROVIDER)."
  value       = google_iam_workload_identity_pool_provider.github_plan.name
}

output "plan_service_account" {
  description = "Read-only planner SA email (paste into GitHub variable GCP_PLAN_SA)."
  value       = google_service_account.planner.email
}

output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}
