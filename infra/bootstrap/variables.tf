variable "project_id" {
  description = "GCP project ID that owns all MyCA infrastructure (Akhil's account)."
  type        = string
}

variable "region" {
  description = "Default region for regional resources."
  type        = string
  default     = "asia-south1"
}

variable "github_repository_id" {
  description = "Numeric ID of the GitHub repository allowed to deploy (gh api repos/OWNER/REPO --jq .id). The ID survives renames and cannot be re-registered by someone else, unlike owner/name."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "github_repository_id must be the repository's numeric ID, not owner/name."
  }
}

variable "state_bucket_name" {
  description = "Terraform remote-state bucket name. Defaults to <project_id>-myca-tfstate."
  type        = string
  default     = ""
}

variable "site_bucket_name" {
  description = "Must match the root module's site_bucket_name. Defaults to <project_id>-myca-site."
  type        = string
  default     = ""
}

variable "artifacts_bucket_name" {
  description = "Must match the root module's artifacts_bucket_name. Defaults to <project_id>-myca-artifacts."
  type        = string
  default     = ""
}

variable "downloads_bucket_name" {
  description = "Must match the root module's downloads_bucket_name. Defaults to <project_id>-myca-downloads."
  type        = string
  default     = ""
}

variable "deploy_service_account_id" {
  description = "Account ID (not email) of the CI deploy service account (main branch and v* tags)."
  type        = string
  default     = "gh-deployer"
}

variable "plan_service_account_id" {
  description = "Account ID (not email) of the read-only CI service account used for pull-request plans."
  type        = string
  default     = "gh-planner"
}

variable "pool_id" {
  description = "Workload Identity pool and provider id for deploys; the PR plan pool adds -plan. Prefixed with myca so it cannot collide with another app's pool in a shared project."
  type        = string
  default     = "myca-github"
}

variable "manage_site" {
  description = "Also let the deployer run the root module (marketing site load balancer, DNS, site buckets, uptime checks). Off by default, so in a shared project the deployer can only touch MyCA's own API, which infra/cloud grants."
  type        = bool
  default     = false
}
