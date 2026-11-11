# Pinwheel: W-2s and 1099s from the employer

The owner connects their employer or payroll provider once through Pinwheel Link, and
MyCA reads their W-2 (and 1099-NEC or 1099-MISC) boxes straight into the US return.

## Flow

1. `set_channel_connector { channel: "pinwheel", apiSecret, environment: "sandbox" }` saves the
   secret in the vault (`production` for live).
2. `pinwheel_link_token` gives the app a Link token (`features: ["tax_forms"]`). The app opens
   Pinwheel Link with it; Link returns an account id when the owner finishes.
3. `payroll_tax_forms { taxYear, accountId }` lists the forms with every box in dollars, notes
   Pinwheel's low-confidence warnings, and remembers the account id. It adds nothing.
4. `import_payroll_tax_forms { taxYear, taxFormIds }` asks for confirmation, fetches the chosen
   forms again from Pinwheel (so the figures cannot be edited in between) and adds them with
   `addUsTaxForm` from `us-return.mjs`. A form already added (same `pinwheel-<id>` document id)
   is skipped.

Every call goes through the action gate as `pinwheel_read` (family `channel`, behind
`MYCA_ENABLE_CHANNEL_PULLS`). Mock mode shows a sample W-2 and never adds it to the return.

## Mapping

| Pinwheel | US return field |
|---|---|
| box_c.name, box_b | payer, payerTin |
| box_1 to box_7 | wages, federalWithheld, socialSecurityWages, socialSecurityTax, medicareWages, medicareTax, socialSecurityTips |
| box_12 | box12 codes |
| box_13.retirement_plan | retirementPlan |
| box_15_to_20[0] | state, stateWages (16), stateWithheld (17), localWithheld (19) |

A W-2 with more than one state carries the first and says so. A W-2c is added with a note to
remove the original.

## Not verified yet

- Amounts are read as cents (`PINWHEEL_CENTS` in `us-connectors.mjs`). Check one sandbox W-2
  against its PDF before the first season.
- The 1099 payer field names and the Link token body are written from the public API
  reference and have not been run against the Pinwheel sandbox.
- Connectors are read from this machine's `channels.json`; the hosted API does not load them
  yet, so the US app needs per-account Pinwheel settings on the server before launch.
