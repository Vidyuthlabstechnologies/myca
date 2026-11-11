# Country packs

MyCA is one codebase that serves many countries. Everything that differs by country lives in one
file per country under `platform/src/countries/`, and the rest of the system reads it from there.
A business's country (`state.company.country`) then switches the tools the assistant can call,
money and year formats, filing routes, prices and the data region, with no fork and no flag.

| File | Country | Status |
|---|---|---|
| `india.mjs` | IN India | live |
| `united-states.mjs` | US United States | beta (Form 1040, US books) |
| `planned.mjs` | GB, CA, AE, AU | planned: listed for the roadmap, not selectable |
| `index.mjs` | the registry, `packProblems()` checks | |

`node scripts/countries.mjs` prints the matrix and exits 1 when a pack is broken.

## What a pack holds

| Key | Used by |
|---|---|
| `code`, `name`, `currency`, `symbol`, `locale`, `minorUnit`, `yearStartMonth`, `yearLabel`, `taxId` | `platform/src/country.mjs` (`COUNTRIES`, `formatMoney`, `yearOf`) |
| `status` | `live` and `beta` packs can be picked by a business; `planned` ones cannot |
| `requiresState` | `cloud/src/businesses.mjs` (a business must give its state or province) |
| `residency` (`regionPrefixes`, `defaultRegion`, `rule`, `timeZone`) | `cloud/src/residency.mjs` and `infra/cloud/country.tf` |
| `app` (`flavor`, `androidId`, `label`, `edition`) | the Android flavor of that country's store app; `GET /v1/countries` |
| `billing` (`currency`, `providers`, `plans`) | prices shown before sign-in; a cloud test keeps India's in step with `cloud/src/billing.mjs` |
| `filing` (`authority`, `route`, `liveSwitch`, `modules`) | which government integration files for that country |
| `taxModules`, `knowledge` | the `ask_tax` modules and knowledge bases the assistant may use |
| `compliance` | where that country's compliance documents live |
| `toolPolicy`, `tools` | which assistant tools serve the country (below) |

## Tools

A tool listed in a pack's `tools` serves only that country. India's pack has `toolPolicy: 'unclaimed'`,
so India gets every tool no other pack claims. Every other pack has `toolPolicy: 'shared-and-own'`:
it gets its own tools plus the cross-country `SHARED_TOOLS` in `country.mjs`.

Keep `tools` sorted, one name per line. Two branches that each add a tool then touch different
lines and merge without a conflict. `packProblems()` fails the suite if the list is out of order.
Never add a country's tools to `country.mjs`.

## Data stays in its country

Each country is its own deployment: its own Google Cloud project (or at least its own Cloud Run
service, Cloud SQL instance, bucket and Terraform state), in a region of that country.

- `infra/cloud/country.tf` takes `country` and refuses a `region` outside it.
  `infra/cloud/countries/<code>.tfvars` holds each country's region and time zone.
  Initialise each country under its own state prefix:
  `terraform init -backend-config="bucket=<project>-myca-tfstate" -backend-config="prefix=cloud-us"`,
  then `terraform apply -var-file=countries/us.tfvars -var project_id=<us project> ...`.
- The API reads `MYCA_COUNTRIES` (the countries it hosts) and `MYCA_REGION`. It refuses to start
  when a hosted country's data may not live in that region, and refuses to open books for a
  country hosted elsewhere (`COUNTRY_HOSTED_ELSEWHERE`, with the right app's name).
  Unset `MYCA_COUNTRIES` hosts every served country, which keeps local runs and today's single
  deployment working; set it on every production deployment.
- `GET /v1/countries` lists served countries, their apps, prices and filing routes, and which of
  them this deployment hosts, so an app or the website can configure itself.

## Adding a country

1. Move its entry from `planned.mjs` to its own `<country>.mjs`, fill every key, set `status: 'beta'`.
2. Add its regions to `infra/cloud/country.tf` and a `countries/<code>.tfvars`. The platform suite
   checks both against the pack.
3. Add its tax engine, filing client and knowledge base as modules named in the pack, and list its
   tools in the pack.
4. Add the Android flavor named in `app.flavor` to `mobile/android/app/build.gradle.kts`.
5. Deploy it as its own country (above) and point the new app's `MYCA_CLOUD_URL` at it.
6. Write its compliance documents under `docs/compliance/<code>/`.
