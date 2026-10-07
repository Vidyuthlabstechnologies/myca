variable "project_id" {
  description = "GCP project that hosts the MyCA API."
  type        = string

  validation {
    condition     = length(trimspace(var.project_id)) > 0
    error_message = "project_id is required."
  }
}

variable "region" {
  description = "Region for every resource. Data must stay in India."
  type        = string
  default     = "asia-south1"

  validation {
    condition     = startswith(var.region, "asia-south")
    error_message = "MyCA data stays in India: use asia-south1 (Mumbai) or asia-south2 (Delhi)."
  }
}

variable "image" {
  description = "Container image for the API, e.g. asia-south1-docker.pkg.dev/<project>/myca-api/api:<tag>."
  type        = string
}

variable "google_client_ids" {
  description = "OAuth client ids whose Google ID tokens the API accepts for sign-in."
  type        = list(string)
  default     = []
}

variable "db_tier" {
  description = "Cloud SQL machine tier. Shared-core tiers are cheapest and fit a pilot."
  type        = string
  default     = "db-g1-small"
}

variable "min_instances" {
  description = "Cloud Run instances kept warm."
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Cloud Run instance ceiling."
  type        = number
  default     = 4
}

variable "deletion_protection" {
  description = "Protect the database from terraform destroy. Turn off only to tear down a test environment."
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Email for API alerts. Empty disables alerting."
  type        = string
  default     = ""
}
