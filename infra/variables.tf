variable "project_id" {
  description = "GCP project ID that owns the MyCA infrastructure."
  type        = string
}

variable "region" {
  description = "Default region for regional resources."
  type        = string
  default     = "asia-south1"
}

variable "site_bucket_name" {
  description = "Bucket for the static marketing site. Defaults to <project_id>-myca-site."
  type        = string
  default     = ""
}

variable "artifacts_bucket_name" {
  description = "Bucket for release installers. Defaults to <project_id>-myca-artifacts."
  type        = string
  default     = ""
}

variable "downloads_bucket_name" {
  description = "Public bucket served at /downloads/*. Defaults to <project_id>-myca-downloads."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Custom domain (apex) for the site, e.g. myca.in. Leave empty to serve over the LB IP only (HTTP)."
  type        = string
  default     = ""
}

variable "manage_dns" {
  description = "Create a Cloud DNS zone and A records for domain_name. Set false if DNS lives elsewhere."
  type        = bool
  default     = true
}

variable "create_artifact_registry" {
  description = "Create a Docker Artifact Registry repo for future backend images."
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Email for uptime alerts. Empty disables alerting (uptime check still runs)."
  type        = string
  default     = ""
}

variable "labels" {
  description = "Labels applied to resources."
  type        = map(string)
  default = {
    app        = "myca"
    managed_by = "terraform"
  }
}
