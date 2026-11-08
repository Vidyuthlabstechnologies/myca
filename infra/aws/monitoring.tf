locals {
  alerts = var.alert_email != ""
}

resource "aws_sns_topic" "alerts" {
  count = local.alerts ? 1 : 0
  name  = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts" {
  count     = local.alerts ? 1 : 0
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_budgets_budget" "monthly" {
  count = local.alerts ? 1 : 0

  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

resource "aws_cloudwatch_metric_alarm" "db_storage" {
  count = local.alerts ? 1 : 0

  alarm_name          = "${local.name}-db-storage-low"
  alarm_description   = "The MyCA database has less than 2 GB free"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 2147483648
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]
}

resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  count = local.alerts ? 1 : 0

  alarm_name          = "${local.name}-db-cpu-high"
  alarm_description   = "The MyCA database CPU stayed above 80% for 15 minutes"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]
}

resource "aws_cloudwatch_metric_alarm" "nat_down" {
  count = local.alerts ? 1 : 0

  alarm_name          = "${local.name}-nat-down"
  alarm_description   = "The NAT instance failed its status check; outbound calls from the API will fail. EC2 recovers it automatically."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = { InstanceId = aws_instance.nat.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts[0].arn, "arn:aws:automate:${var.region}:ec2:recover"]
}
