terraform {
  required_version = ">= 1.6.0"

  # State holds the database password and the generated keys, so it stays on the
  # owner's machine in a locked folder, given at init time:
  #   terraform init -backend-config="path=D:/keys/myca/aws-state/terraform.tfstate"
  backend "local" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile != "" ? var.aws_profile : null

  default_tags {
    tags = {
      app        = "myca"
      component  = "api"
      managed_by = "terraform"
    }
  }
}
