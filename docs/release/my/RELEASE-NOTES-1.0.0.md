# MyCA Malaysia 1.0.0 release notes

Play's "What's new" field allows 500 characters per language. Both texts below are under 500
(checked 2026-11-14).

## en-MY

```release-notes-en
Welcome to MyCA Malaysia.
- Send e-invoices to LHDN MyInvois after you approve each one
- Step-by-step setup to add MyCA as your intermediary
- Monthly consolidated e-invoices, with the RM10,000 and 7-day rules built in
- Check if you must e-invoice (exempt below RM3 million)
- SST-02 figures ready for MySST
- Income tax estimate for Form BE or B, to file in MyTax
- English and Bahasa Melayu
```

## ms-MY

```release-notes-ms
Selamat datang ke MyCA Malaysia.
- Hantar e-Invois ke LHDN MyInvois selepas anda meluluskan setiap satu
- Persediaan langkah demi langkah untuk menambah MyCA sebagai perantara
- E-Invois disatukan bulanan, dengan peraturan RM10,000 dan 7 hari
- Semak jika anda perlu e-Invois (dikecualikan di bawah RM3 juta)
- Angka SST-02 sedia untuk MySST
- Anggaran cukai pendapatan Borang BE atau B, untuk difailkan di MyTax
- Bahasa Melayu dan Bahasa Inggeris
```

## Internal release checklist for 1.0.0

- [ ] Build `my` flavor, versionCode set, signed with the upload key; Play App Signing on.
- [ ] Owner-only blockers in `docs/compliance/my/MALAYSIA-LAUNCH.md` closed.
- [ ] MyInvois production credentials and certificate in Secret Manager; sandbox flag off.
- [ ] Internal testing, then closed testing, then production at a 20% staged rollout.
- [ ] Crash-free sessions above 99.5% for 7 days before 100%.
