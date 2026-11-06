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
