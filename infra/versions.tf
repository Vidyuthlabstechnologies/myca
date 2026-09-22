terraform {
  required_version = ">= 1.6.0"

  # Partial backend: bucket supplied at init time, e.g.
  #   terraform init -backend-config="bucket=<project-id>-myca-tfstate"
  # State lives under root/; the bootstrap module never shares this prefix.
  backend "gcs" {
    prefix = "root"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}
