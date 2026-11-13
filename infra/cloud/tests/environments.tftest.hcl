mock_provider "google" {
  mock_resource "google_service_account" {
    defaults = {
      name  = "projects/myca-test/serviceAccounts/mock-account@myca-test.iam.gserviceaccount.com"
      email = "mock-account@myca-test.iam.gserviceaccount.com"
    }
  }
}
mock_provider "random" {}

variables {
  project_id  = "myca-test"
  region      = "asia-south1"
  alert_email = ""
  image       = "asia-south1-docker.pkg.dev/myca-test/myca-api/myca-api:test"
}

run "production_keeps_its_original_names" {
  command = apply

  assert {
    condition     = google_cloud_run_v2_service.api.name == "myca-api"
    error_message = "The production API service must stay myca-api."
  }

  assert {
    condition     = google_sql_database_instance.main.name == "myca"
    error_message = "The production database instance must stay myca."
  }

  assert {
    condition     = google_storage_bucket.documents.name == "myca-test-myca-documents"
    error_message = "The production documents bucket must keep its name."
  }

  assert {
    condition     = google_secret_manager_secret.api["MYCA_BOOKS_KEY"].secret_id == "myca-books-key"
    error_message = "Production secrets must keep unprefixed ids."
  }

  assert {
    condition     = google_service_account.play_push.account_id == "myca-play-push"
    error_message = "The production Play push account must keep its id."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.site) == 1 && length(google_secret_manager_secret.release) == 4
    error_message = "Production owns the site and the Android release secrets."
  }

  assert {
    condition     = length(google_service_account.site) == 1 && google_service_account.site[0].account_id == "myca-site"
    error_message = "The website runs as its own service account, not the project's default one."
  }

  assert {
    condition     = anytrue([for env in google_cloud_run_v2_service.api.template[0].containers[0].env : env.name == "MYCA_ENVIRONMENT" && env.value == "production"])
    error_message = "Production must run with MYCA_ENVIRONMENT=production."
  }
}

run "production_keeps_the_play_reviewer_sign_in_off_by_default" {
  command = apply

  assert {
    condition     = !anytrue([for env in google_cloud_run_v2_service.api.template[0].containers[0].env : startswith(env.name, "MYCA_REVIEWER_")])
    error_message = "The Play reviewer sign-in must stay off until reviewer_phone is set."
  }
}

run "production_turns_on_the_play_reviewer_sign_in" {
  command = apply

  variables {
    reviewer_phone = "+919800000002"
    reviewer_code  = "482913"
  }

  assert {
    condition     = anytrue([for env in google_cloud_run_v2_service.api.template[0].containers[0].env : env.name == "MYCA_REVIEWER_SIGN_IN" && env.value == "on"])
    error_message = "Setting reviewer_phone must turn the reviewer sign-in on."
  }

  assert {
    condition     = anytrue([for env in google_cloud_run_v2_service.api.template[0].containers[0].env : env.name == "MYCA_REVIEWER_PHONE" && env.value == "+919800000002"])
    error_message = "The reviewer's number must reach the server."
  }

  assert {
    condition     = contains(keys(google_secret_manager_secret.api), "MYCA_REVIEWER_CODE") && google_secret_manager_secret.api["MYCA_REVIEWER_CODE"].secret_id == "myca-reviewer-code"
    error_message = "The reviewer's code must be a secret, not a plain variable."
  }
}

run "staging_gets_its_own_prefixed_stack" {
  command = apply

  variables {
    environment   = "staging"
    provider_mode = "simulated"
    test_phones   = ["+919800000001"]
    test_code     = "482913"
  }

  assert {
    condition     = google_cloud_run_v2_service.api.name == "myca-staging-api"
    error_message = "The staging API service must be myca-staging-api."
  }

  assert {
    condition     = google_sql_database_instance.main.name == "myca-staging"
    error_message = "Staging must have its own database instance."
  }

  assert {
    condition     = google_storage_bucket.documents.name == "myca-test-myca-staging-documents"
    error_message = "Staging must have its own documents bucket."
  }

  assert {
    condition     = google_secret_manager_secret.api["MYCA_TOKEN_SECRET"].secret_id == "staging-myca-token-secret" && google_secret_manager_secret.api["MYCA_BOOKS_KEY"].secret_id == "staging-myca-books-key"
    error_message = "Staging must have its own token secret and books key."
  }

  assert {
    condition     = google_artifact_registry_repository.api.repository_id == "myca-staging-api"
    error_message = "Staging must push images to its own registry."
  }

  assert {
    condition     = google_cloud_scheduler_job.daily.name == "myca-staging-api-daily"
    error_message = "Staging must have its own daily job."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.site) == 0 && length(google_secret_manager_secret.release) == 0
    error_message = "Staging must not create the site or the Android release secrets."
  }

  assert {
    condition     = length(google_service_account.site) == 0
    error_message = "Staging must not create the website's service account."
  }

  assert {
    condition     = anytrue([for env in google_cloud_run_v2_service.api.template[0].containers[0].env : env.name == "MYCA_ENVIRONMENT" && env.value == "staging"])
    error_message = "Staging must run with MYCA_ENVIRONMENT=staging."
  }

  assert {
    condition     = anytrue([for env in google_cloud_run_v2_service.api.template[0].containers[0].env : env.name == "MYCA_MOCK_MODE" && env.value == "1"])
    error_message = "Staging must run simulated providers."
  }

  assert {
    condition     = anytrue([for env in google_cloud_run_v2_service.api.template[0].containers[0].env : env.name == "MYCA_TEST_PHONES" && env.value == "+919800000001"])
    error_message = "Staging must pass its test phones to the server."
  }

  assert {
    condition     = contains(keys(google_secret_manager_secret.api), "MYCA_TEST_CODE")
    error_message = "The staging test code must be a secret."
  }
}

run "staging_refuses_the_default_test_provider_mode" {
  command = plan

  variables {
    environment = "staging"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "staging_refuses_a_real_whatsapp_gateway" {
  command = plan

  variables {
    environment   = "staging"
    provider_mode = "simulated"
    waha_url      = "https://waha.example.in"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "staging_refuses_a_model_key" {
  command = plan

  variables {
    environment   = "staging"
    provider_mode = "simulated"
    model_api_key = "model-key"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "staging_refuses_play_billing" {
  command = plan

  variables {
    environment      = "staging"
    provider_mode    = "simulated"
    play_product_pro = "myca_pro"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "production_refuses_test_phones" {
  command = plan

  variables {
    test_phones = ["+919800000001"]
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "reviewer_phone_without_a_code_is_refused" {
  command = plan

  variables {
    reviewer_phone = "+919800000002"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "reviewer_code_without_a_phone_is_refused" {
  command = plan

  variables {
    reviewer_code = "482913"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "reviewer_code_must_be_six_digits" {
  command = plan

  variables {
    reviewer_phone = "+919800000002"
    reviewer_code  = "48291"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "reviewer_code_the_server_calls_easy_to_guess_is_refused" {
  command = plan

  variables {
    reviewer_phone = "+919800000002"
    reviewer_code  = "123456"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "reviewer_phone_must_be_an_indian_mobile" {
  command = plan

  variables {
    reviewer_phone = "+912212345678"
    reviewer_code  = "482913"
  }

  expect_failures = [google_cloud_run_v2_service.api]
}

run "reviewer_phone_may_be_written_with_spaces" {
  command = apply

  variables {
    reviewer_phone = "+91 98000 00002"
    reviewer_code  = "482913"
  }

  assert {
    condition     = anytrue([for env in google_cloud_run_v2_service.api.template[0].containers[0].env : env.name == "MYCA_REVIEWER_SIGN_IN" && env.value == "on"])
    error_message = "A number the server accepts must pass the plan."
  }
}
