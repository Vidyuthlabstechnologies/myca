terraform {
  required_version = ">= 1.6.0"

  # Partial backend: bucket supplied at init time, e.g.
  #   terraform init -backend-config="bucket=<project-id>-myca-tfstate"
  # The hosted API keeps its state under cloud/, apart from the site (root/) and
  # the bootstrap module.
  backend "gcs" {
    prefix = "cloud"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
