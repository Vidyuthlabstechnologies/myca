variable "project_id" {
  description = "GCP project ID that owns all MyCA infrastructure (Akhil's account)."
  type        = string
}

variable "region" {
  description = "Default region for regional resources."
  type        = string
  default     = "asia-south1"
}

variable "github_repository" {
  description = "GitHub repo allowed to deploy, as owner/name (e.g. varshinicb1/myca)."
  type        = string
}

variable "state_bucket_name" {
  description = "Terraform remote-state bucket name. Defaults to <project_id>-myca-tfstate."
  type        = string
  default     = ""
}

variable "deploy_service_account_id" {
  description = "Account ID (not email) of the CI deploy service account."
  type        = string
  default     = "gh-deployer"
}

variable "github_branch_restriction" {
  description = "Optional Git ref restriction for WIF (e.g. refs/heads/main). Empty allows the whole repo."
  type        = string
  default     = ""
}
