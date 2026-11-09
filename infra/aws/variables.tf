variable "region" {
  description = "AWS region for every resource. Data must stay in India."
  type        = string
  default     = "ap-south-1"

  validation {
    condition     = contains(["ap-south-1", "ap-south-2"], var.region)
    error_message = "MyCA data stays in India: use ap-south-1 (Mumbai) or ap-south-2 (Hyderabad)."
  }
}

variable "aws_profile" {
  description = "AWS CLI profile to use, for example the one made by aws configure sso. Empty uses the default chain."
  type        = string
  default     = "myca"
}

variable "image" {
  description = "Container image for the API in this account's ECR repository, for example <account>.dkr.ecr.ap-south-1.amazonaws.com/myca-api:<tag>. Empty creates only the registry, for the first push."
  type        = string
  default     = ""
}

variable "google_client_ids" {
  description = "OAuth client ids whose Google ID tokens the API accepts for sign-in (the web client id from Firebase Authentication)."
  type        = list(string)
  default     = []
}

variable "pilot_sign_in_codes_in_logs" {
  description = "Closed pilot only: sign-in codes go to the service log instead of an SMS, so only someone who can read the AWS logs can let a person in. Turns off the production switch. Leave false once Google Sign-In or an SMS provider is set."
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email for the monthly budget and database alarms. Empty skips them."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget in US dollars; an email is sent at 80% of actual and 100% of forecast spend."
  type        = number
  default     = 50
}

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro fits a pilot."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_storage_gb" {
  description = "Initial database storage in GB; it grows on its own up to db_max_storage_gb."
  type        = number
  default     = 20
}

variable "db_max_storage_gb" {
  description = "Ceiling for storage autoscaling in GB."
  type        = number
  default     = 100
}

variable "deletion_protection" {
  description = "Protect the database from terraform destroy and from deletion in the console."
  type        = bool
  default     = true
}

variable "nat_instance_type" {
  description = "Instance type of the small NAT instance that gives the API outbound internet access (Google sign-in keys, Play, SMS)."
  type        = string
  default     = "t4g.nano"
}

variable "max_instances" {
  description = "App Runner instance ceiling."
  type        = number
  default     = 2
}

variable "provider_mode" {
  description = "Highest government-provider mode any business may use: live, test, simulated or dry-run."
  type        = string
  default     = "test"

  validation {
    condition     = contains(["live", "test", "simulated", "dry-run"], var.provider_mode)
    error_message = "provider_mode is live, test, simulated or dry-run."
  }
}

variable "daily_job_cron" {
  description = "EventBridge cron (UTC) for the daily checks; the default is 02:30 India time."
  type        = string
  default     = "cron(0 21 * * ? *)"
}

variable "weekly_job_cron" {
  description = "EventBridge cron (UTC) for the Monday brief; the default is 07:00 India time on Monday."
  type        = string
  default     = "cron(30 1 ? * MON *)"
}

variable "play_package_name" {
  description = "Android package name the Google Play subscriptions belong to."
  type        = string
  default     = "com.mldynamic.myca"
}

variable "play_product_pro" {
  description = "Play Console product id of the Pro subscription, for example myca_pro_monthly. Empty leaves subscriptions off."
  type        = string
  default     = ""
}

variable "play_product_firm" {
  description = "Play Console product id of the CA firm subscription, for example myca_firm_monthly. Empty leaves that plan unsold."
  type        = string
  default     = ""
}

variable "play_service_account_json" {
  description = "The whole JSON key of the Google Cloud service account invited in Play Console (View financial data, Manage orders and subscriptions). Needed when a Play product is set; kept in SSM."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gst_session_job_rate" {
  description = "EventBridge schedule for refreshing GST portal sessions; each lasts 6 hours, and the job refreshes those ending within 90 minutes."
  type        = string
  default     = "rate(1 hour)"
}

variable "gsp_api_key" {
  description = "Sandbox by Quicko API key MyCA uses as the ASP (key_test_... or key_live_...). Empty leaves GST portal calls unavailable; kept in SSM."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gsp_api_secret" {
  description = "Secret of the Sandbox by Quicko API key; kept in SSM."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gsp_environment" {
  description = "Which Sandbox host the key belongs to: test (test-api.sandbox.co.in) or live (api.sandbox.co.in)."
  type        = string
  default     = "test"

  validation {
    condition     = contains(["test", "live"], var.gsp_environment)
    error_message = "gsp_environment is test or live."
  }
}
