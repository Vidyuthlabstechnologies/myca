variable "country" {
  description = "The one country this deployment serves (ISO code, as in platform/src/countries). Each country is its own deployment, project and state prefix, so its data never leaves it."
  type        = string
  default     = "IN"

  validation {
    condition     = contains(["IN", "US", "GB", "AE"], var.country)
    error_message = "MyCA serves IN, US, GB (beta) and AE (beta) today. Add a country pack in platform/src/countries before deploying a new country."
  }
}

locals {
  country_regions = {
    IN = ["asia-south1", "asia-south2"]
    US = ["us-central1", "us-east1", "us-east4", "us-west1"]
    GB = ["europe-west2"]
    AE = ["me-central1"]
  }
}

resource "terraform_data" "country_residency" {
  input = var.country

  lifecycle {
    precondition {
      condition     = contains(local.country_regions[var.country], var.region)
      error_message = "The region ${var.region} is outside ${var.country}. Data stays in its own country; use one of: ${join(", ", local.country_regions[var.country])}."
    }
  }
}
