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

variable "weekly_job_schedule" {
  description = "Cron for the Monday brief sent on WhatsApp, in daily_job_time_zone."
  type        = string
  default     = "0 7 * * 1"
}

variable "log_retention_days" {
  description = "Days the MyCA log bucket keeps the API, database and job logs (CERT-In directions of April 2022 ask for 180). The project _Default bucket is left alone."
  type        = number
  default     = 180
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

variable "provider_mode" {
  description = "Highest mode any business may use. \"live\" lets each business switch itself between test and live in the app with its own Quicko and NIC keys (live writes need a second person's approval). \"test\" keeps every business on the sandbox hosts. \"simulated\" answers with labelled results and no network. \"dry-run\" sends nothing."
  type        = string
  default     = "test"

  validation {
    condition     = contains(["live", "test", "simulated", "dry-run"], var.provider_mode)
    error_message = "provider_mode is live, test, simulated or dry-run."
  }
}

variable "gsp_test_api_key" {
  description = "Sandbox by Quicko test-environment API key used in test mode. Leave \"unset\" until you have one."
  type        = string
  default     = "unset"
  sensitive   = true
}

variable "gsp_test_api_secret" {
  description = "Sandbox by Quicko test-environment API secret used in test mode."
  type        = string
  default     = "unset"
  sensitive   = true
}

variable "public_url" {
  description = "Public https address of the API (a custom domain in front of Cloud Run). Used for OAuth redirect URIs. Empty uses the request host."
  type        = string
  default     = ""
}

variable "sms_provider" {
  description = "SMS sender for phone sign-in codes: \"twilio\", \"msg91\" or empty for none (then Google or OIDC sign-in must be set)."
  type        = string
  default     = ""

  validation {
    condition     = contains(["", "twilio", "msg91"], var.sms_provider)
    error_message = "sms_provider is twilio, msg91 or empty."
  }
}

variable "sms_secret" {
  description = "The SMS provider's secret: the Twilio auth token or the MSG91 auth key. Leave \"unset\" until the account exists."
  type        = string
  default     = "unset"
  sensitive   = true
}

variable "sms_twilio_sid" {
  description = "Twilio account SID (sms_provider = twilio)."
  type        = string
  default     = ""
}

variable "sms_twilio_from" {
  description = "Twilio sender number or messaging service id (sms_provider = twilio)."
  type        = string
  default     = ""
}

variable "sms_msg91_template_id" {
  description = "MSG91 OTP template id, DLT-approved (sms_provider = msg91)."
  type        = string
  default     = ""
}

variable "model_api_key" {
  description = "API key for the language model that reads bills and answers in Hindi and Telugu. Leave \"unset\" to run without a model (English rules only)."
  type        = string
  default     = "unset"
  sensitive   = true
}

variable "model_name" {
  description = "Model id sent to the model provider. Empty uses the engine default."
  type        = string
  default     = ""
}

variable "model_base_url" {
  description = "OpenAI-compatible base URL of the model provider. Empty uses the engine default."
  type        = string
  default     = ""
}

variable "play_package_name" {
  description = "Android package name the Google Play subscriptions belong to."
  type        = string
  default     = "com.mldynamic.myca"
}

variable "play_product_pro" {
  description = "Google Play subscription product id for the Pro plan, as created in Play Console (Monetize > Subscriptions). Empty, with play_product_firm empty too, turns billing off: every business keeps its trial plan and nothing is gated."
  type        = string
  default     = ""
}

variable "play_product_firm" {
  description = "Google Play subscription product id for the CA firm plan."
  type        = string
  default     = ""
}

variable "plan_prices" {
  description = "Monthly prices shown in the app, in rupees, used only until the app reads the Play Store price, for example \"pro=499,firm=1499\"."
  type        = string
  default     = ""
}

variable "deployer_service_account" {
  description = "The bootstrap deploy_service_account output. It gets push on the myca-api registry, run.developer on the myca-api service and actAs on its service account, so CI can roll out the API and nothing else. Empty skips these grants."
  type        = string
  default     = ""
}

variable "carried_secrets" {
  description = "Secrets carried over from an earlier host, by environment variable name (MYCA_BOOKS_KEY, MYCA_CONNECTOR_KEY, MYCA_TOKEN_SECRET, ...). A value given here replaces the generated one, so books sealed elsewhere still open. Empty values are ignored."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "waha_url" {
  description = "Base URL of the self-hosted WhatsApp gateway (WAHA). Empty leaves the WAHA route off. Point its webhook at <api_url>/v1/whatsapp/waha with HMAC sha512 and the waha_webhook_secret output."
  type        = string
  default     = ""

  validation {
    condition     = var.waha_url == "" || can(regex("^https://", var.waha_url))
    error_message = "waha_url must be https://: the API refuses a plain-http gateway outside local runs."
  }
}

variable "waha_api_key" {
  description = "The X-Api-Key the WhatsApp gateway was started with (WAHA_API_KEY)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "waha_session" {
  description = "The gateway session that holds the scanned WhatsApp number."
  type        = string
  default     = "default"
}

variable "gsp_api_key" {
  description = "Sandbox by Quicko API key for the host chosen by gsp_environment. Empty leaves it unset."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gsp_api_secret" {
  description = "Sandbox by Quicko API secret paired with gsp_api_key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gsp_environment" {
  description = "Which Sandbox host gsp_api_key belongs to: test or live."
  type        = string
  default     = "test"

  validation {
    condition     = contains(["test", "live"], var.gsp_environment)
    error_message = "gsp_environment is test or live."
  }
}

variable "play_product_essentials" {
  description = "Play Console product id of the Essentials subscription. Empty leaves that plan unsold."
  type        = string
  default     = ""
}

variable "play_service_account_json" {
  description = "Optional Play Developer API service account key. On Cloud Run the API's own service account is used when this is empty (add it as a user in Play Console)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "email_relay_url" {
  description = "URL of the email relay (email-relay/ in this repo). Empty leaves email sending off."
  type        = string
  default     = ""
}

variable "email_from" {
  description = "From address for emails MyCA sends."
  type        = string
  default     = ""
}

variable "email_relay_token" {
  description = "Bearer token the email relay expects."
  type        = string
  default     = ""
  sensitive   = true
}

variable "site_id" {
  description = "Firebase Hosting site id; the site is served at https://<site_id>.web.app. Empty uses the project id."
  type        = string
  default     = ""
}

variable "admin_user_ids" {
  description = "MyCA user ids that receive the crash digest (MYCA_ADMIN_USER_IDS). Empty turns the digest off."
  type        = list(string)
  default     = []
}

variable "otp_global_per_hour" {
  description = "Cap on sign-in codes sent per hour across all numbers (MYCA_OTP_GLOBAL_PER_HOUR). Null keeps the server default."
  type        = number
  default     = null
}
