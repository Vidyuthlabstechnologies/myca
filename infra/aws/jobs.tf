resource "aws_cloudwatch_event_connection" "jobs" {
  count = local.deploy ? 1 : 0

  name               = "${local.name}-jobs"
  description        = "Sends the MyCA job token to the scheduled job routes"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "x-myca-job-token"
      value = random_password.job_token.result
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "jobs" {
  for_each = local.deploy ? { daily = "daily", weekly = "weekly" } : {}

  name                             = "${local.name}-${each.key}"
  invocation_endpoint              = "https://${aws_apprunner_service.api[0].service_url}/v1/jobs/${each.value}"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.jobs[0].arn
}

resource "aws_iam_role" "jobs" {
  name = "${local.name}-jobs"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "events.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "jobs" {
  count = local.deploy ? 1 : 0

  name = "invoke-myca-jobs"
  role = aws_iam_role.jobs.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "events:InvokeApiDestination", Resource = [for d in aws_cloudwatch_event_api_destination.jobs : d.arn] }]
  })
}

resource "aws_cloudwatch_event_rule" "jobs" {
  for_each = local.deploy ? { daily = var.daily_job_cron, weekly = var.weekly_job_cron } : {}

  name                = "${local.name}-${each.key}"
  description         = each.key == "daily" ? "MyCA daily checks, reminders and erasure of deleted accounts" : "MyCA Monday brief"
  schedule_expression = each.value
}

resource "aws_cloudwatch_event_target" "jobs" {
  for_each = aws_cloudwatch_event_rule.jobs

  rule     = each.value.name
  arn      = aws_cloudwatch_event_api_destination.jobs[each.key].arn
  role_arn = aws_iam_role.jobs.arn
  input    = "{}"

  retry_policy {
    maximum_retry_attempts       = 3
    maximum_event_age_in_seconds = 3600
  }
}
