# ADR-0009: Flutter, Android first, Play Store

| | |
|---|---|
| Status | Accepted |
| Date | 2026-10-05 |

## Context

The owner wants the product on the Google Play Store. Indian small business owners are
overwhelmingly on Android. The interface is a custom, restrained design with its own
icons and typography, and an iOS version is likely later.

## Decision

- The client is a Flutter app in `mobile/`, Android only for now, application id
  `com.mldynamic.myca` (owner decision, 6 October 2026; it cannot change after the first
  Play upload).
- The app is thin: it calls the hosted API, formats what the engine returns, and never
  computes a tax or a total.
- Design tokens, the icon set and the logo mark are code. Inter is bundled.
- Package use is kept small: HTTP, file picker, preferences, secure storage, local
  authentication, and PDF creation and printing.
- An earlier plan named React Native; this record supersedes it.

## Consequences

- One codebase can later produce an iOS app.
- Widget tests render every screen without a device, and a tool renders
  screenshots for review.
- The app has not yet run on hardware. The file picker, the save dialog and the
  fingerprint prompt are the unverified parts.
- A release build, signing, the store listing and the data safety declaration are all
  still to do.
- If the product is renamed (PRD Q1), the application id should be settled before the
  first upload, because it cannot change afterwards.

## Alternatives rejected

- Native Kotlin: best platform fit, but a second full rewrite for iOS.
- React Native: viable; Flutter was preferred for a fully custom-drawn interface.
- A web app in a wrapper: weakest for camera capture, sharing into the app and the
  device lock.
