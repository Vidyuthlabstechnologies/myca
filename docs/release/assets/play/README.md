# Play Store graphics

Rendered from the app's own screens and brand by `mobile/tool/play_listing_test.dart`, on the
fictional sample books in `mobile/test/fake_api.dart` (Nalanda Textiles LLP, Gujarat Weaves). No real
business or person appears in them.

| File | Play Console field | Size |
|---|---|---|
| `feature-graphic.png` | Feature graphic | 1024 × 500 |
| `phone-01-home.png` | Phone screenshot 1: the day at a glance | 1080 × 2160 |
| `phone-02-sale-preview.png` | Phone screenshot 2: a sale waiting for your confirmation | 1080 × 2160 |
| `phone-03-customer.png` | Phone screenshot 3: a customer's invoices and quotes | 1080 × 2160 |
| `phone-04-invoice.png` | Phone screenshot 4: a tax invoice | 1080 × 2160 |
| `phone-05-taxes.png` | Phone screenshot 5: taxes and filings | 1080 × 2160 |
| `phone-06-gst-review.png` | Phone screenshot 6: the GST return review | 1080 × 2160 |
| `phone-07-reports.png` | Phone screenshot 7: reports | 1080 × 2160 |
| `phone-08-books-check.png` | Phone screenshot 8: the books check | 1080 × 2160 |

Every file is a 24-bit PNG with no alpha channel, as Play asks for screenshots and the feature
graphic, and the screenshots are exactly 2:1, the longest Play accepts. The 512 × 512 icon is
`../play-icon-512.png`.

To render them again after a screen or brand change, from `mobile/`:

```bash
flutter test tool/play_listing_test.dart
```

The files are overwritten in place; look at the diff before committing. The wider set of screens in
`mobile/tool/screens/` (from `tool/screenshots_test.dart`, 1080 × 2280) is for design review only:
Play would reject that ratio.
