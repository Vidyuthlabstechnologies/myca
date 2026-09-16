terraform {
  required_version = ">= 1.6.0"

  # Bootstrap state is intentionally local: it runs once, before any bucket exists.
  # After it creates the state bucket you may migrate:
  #   terraform init -migrate-state -backend-config="bucket=<project-id>-myca-tfstate"
  backend "local" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}
