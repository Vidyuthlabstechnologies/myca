terraform {
  required_version = ">= 1.6.0"

  # Bootstrap state is local: it runs once, before the state bucket exists.
  # To move it into the bucket later, keep it apart from the root module
  # (which uses prefix "root") by replacing this block with
  #   backend "gcs" { prefix = "bootstrap" }
  # and then running
  #   terraform init -migrate-state -backend-config="bucket=<project-id>-myca-tfstate" -backend-config="prefix=bootstrap"
  # CI's deployer can read and write only the root/ prefix.
  backend "local" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}
