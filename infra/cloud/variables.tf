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

variable "daily_job_schedule" {
  description = "Cron for the daily checks, in daily_job_time_zone."
  type        = string
  default     = "30 2 * * *"
}

variable "daily_job_time_zone" {
  description = "Time zone the daily schedule is read in."
  type        = string
  default     = "Asia/Kolkata"
}

variable "sql_availability_type" {
  description = "ZONAL (one zone, cheapest) or REGIONAL (a standby in a second zone, automatic failover, about twice the database cost)."
  type        = string
  default     = "ZONAL"
}

variable "inbound_email_domain" {
  description = "Domain whose mail the email relay forwards to the API as documents (for example inbox.myca.in). Empty hides the addresses."
  type        = string
  default     = ""
}

variable "alert_email" {
  description = "Email for API alerts. Empty disables alerting."
  type        = string
  default     = ""
}

variable "enable_channel_pulls" {
  description = "Let the hosted API pull marketplace and payment reports (Amazon, Shopify, Razorpay) for businesses that saved their connector credentials. Read-only pulls; government and model calls stay off. Owner decision."
  type        = bool
  default     = false
}

variable "oidc_issuer" {
  description = "OpenID Connect issuer URL whose ID tokens the API accepts beside Google (for example a Keycloak realm or an Azure AD tenant). Leave \"unset\" to keep the route off."
  type        = string
  default     = "unset"
}

variable "oidc_client_ids" {
  description = "Client ids (audiences) at the OIDC issuer whose ID tokens the API accepts."
  type        = list(string)
  default     = []
}

variable "whatsapp_app_secret" {
  description = "Meta app secret for the WhatsApp Cloud API webhook signature. Leave \"unset\" until the WhatsApp Business account exists."
  type        = string
  default     = "unset"
  sensitive   = true
}

variable "whatsapp_access_token" {
  description = "WhatsApp Cloud API system-user access token used to send replies. Leave \"unset\" until the account exists."
  type        = string
  default     = "unset"
  sensitive   = true
}

variable "whatsapp_phone_number_id" {
  description = "WhatsApp Cloud API phone number id that receives and sends messages. Leave \"unset\" until the account exists."
  type        = string
  default     = "unset"
}
