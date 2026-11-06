data "aws_caller_identity" "current" {}

locals {
  deploy           = var.image != ""
  parameter_prefix = "/myca/api"
  generated = {
    MYCA_TOKEN_SECRET          = random_password.token_secret.result
    MYCA_BOOKS_KEY             = random_password.books_key.result
    MYCA_CONNECTOR_KEY         = random_password.connector_key.result
    MYCA_JOB_TOKEN             = random_password.job_token.result
    MYCA_INBOUND_RELAY_TOKEN   = random_password.inbound_relay_token.result
    MYCA_WHATSAPP_VERIFY_TOKEN = random_password.whatsapp_verify_token.result
    MYCA_PLAY_NOTIFY_TOKEN     = random_password.play_notify_token.result
  }
  secrets = merge(local.generated, {
    MYCA_DATABASE_URL = "postgres://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
    MYCA_DATABASE_CA  = data.http.rds_ca.response_body
  })
  secret_names = ["MYCA_TOKEN_SECRET", "MYCA_BOOKS_KEY", "MYCA_CONNECTOR_KEY", "MYCA_JOB_TOKEN", "MYCA_INBOUND_RELAY_TOKEN", "MYCA_WHATSAPP_VERIFY_TOKEN", "MYCA_PLAY_NOTIFY_TOKEN", "MYCA_DATABASE_URL", "MYCA_DATABASE_CA"]
  production   = !var.pilot_sign_in_codes_in_logs
  environment = merge(
    {
      PORT                      = "8080"
      MYCA_TRUSTED_PROXY_HOPS   = "1"
      MYCA_MOCK_MODE            = var.provider_mode == "simulated" ? "1" : "0"
      MYCA_PROVIDER_ENV         = contains(["live", "test"], var.provider_mode) ? var.provider_mode : "off"
      MYCA_GOOGLE_CLIENT_IDS    = join(",", var.google_client_ids)
      MYCA_PLAY_PACKAGE         = var.play_package_name
      MYCA_ENABLE_CHANNEL_PULLS = "0"
    },
    local.production ? { MYCA_PRODUCTION = "1" } : { MYCA_DEV_OTP = "1" },
  )
}

resource "random_password" "token_secret" {
  length  = 64
  special = false
}

resource "random_password" "books_key" {
  length  = 64
  special = false
}

resource "random_password" "connector_key" {
  length  = 64
  special = false
}

resource "random_password" "job_token" {
  length  = 64
  special = false
}

resource "random_password" "inbound_relay_token" {
  length  = 64
  special = false
}

resource "random_password" "whatsapp_verify_token" {
  length  = 48
  special = false
}

resource "random_password" "play_notify_token" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "secret" {
  for_each = toset(local.secret_names)

  name  = "${local.parameter_prefix}/${each.key}"
  type  = "SecureString"
  tier  = "Intelligent-Tiering"
  value = local.secrets[each.key]
}

resource "aws_ecr_repository" "api" {
  name                 = local.name
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 15 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 15 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_iam_role" "apprunner_access" {
  name = "${local.name}-ecr-access"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "build.apprunner.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_access" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_iam_role" "api" {
  name = "${local.name}-instance"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "tasks.apprunner.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "api_secrets" {
  name = "read-myca-parameters"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameters", "ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.parameter_prefix}/*"
      },
      {
        Effect    = "Allow"
        Action    = "kms:Decrypt"
        Resource  = "*"
        Condition = { StringEquals = { "kms:ViaService" = "ssm.${var.region}.amazonaws.com" } }
      },
    ]
  })
}

resource "aws_apprunner_vpc_connector" "api" {
  vpc_connector_name = local.name
  subnets            = aws_subnet.private[*].id
  security_groups    = [aws_security_group.api.id]
}

resource "aws_apprunner_auto_scaling_configuration_version" "api" {
  auto_scaling_configuration_name = local.name
  min_size                        = 1
  max_size                        = var.max_instances
  max_concurrency                 = 40
}

resource "aws_apprunner_service" "api" {
  count = local.deploy ? 1 : 0

  service_name                   = local.name
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.api.arn

  source_configuration {
    auto_deployments_enabled = false

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_identifier      = var.image
      image_repository_type = "ECR"

      image_configuration {
        port                          = "8080"
        runtime_environment_variables = local.environment
        runtime_environment_secrets   = { for name, parameter in aws_ssm_parameter.secret : name => parameter.arn }
      }
    }
  }

  instance_configuration {
    cpu               = "256"
    memory            = "512"
    instance_role_arn = aws_iam_role.api.arn
  }

  network_configuration {
    ingress_configuration {
      is_publicly_accessible = true
    }

    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.api.arn
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/v1/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  depends_on = [aws_iam_role_policy.api_secrets, aws_iam_role_policy_attachment.apprunner_access, aws_instance.nat]
}
