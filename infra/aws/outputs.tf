output "api_url" {
  description = "Base URL of the API. Build the app with --dart-define=MYCA_CLOUD_URL=<this>."
  value       = local.deploy ? "https://${aws_apprunner_service.api[0].service_url}" : ""
}

output "image_repository" {
  description = "Push API images here (docker push <this>:<tag>)."
  value       = aws_ecr_repository.api.repository_url
}

output "database_endpoint" {
  description = "Private database host, reachable only from the API."
  value       = aws_db_instance.main.address
}

output "nat_public_ip" {
  description = "The address the API's outbound calls come from (give it to an SMS or GSP provider that allow-lists callers)."
  value       = aws_instance.nat.public_ip
}

output "mode" {
  description = "Whether the service runs with the production switch on, or as a closed pilot with sign-in codes in the log."
  value       = local.production ? "production" : "pilot: sign-in codes go to the App Runner application log"
}
