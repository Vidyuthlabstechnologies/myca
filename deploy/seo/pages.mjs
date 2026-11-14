export const ORIGIN = 'https://__SITE_ORIGIN__';

export const PLAY_ID = 'com.mldynamic.myca';

export const EARLY_ACCESS_ACTION = '__EARLY_ACCESS_URL__';

export const INDIA_PRICES = Object.freeze({ essentials: '₹999', pro: '₹1,999', assured: '₹4,999', firm: '₹5,999' });
export const US_PRICES = Object.freeze({ returnList: '$129', returnLaunch: '$99', launchUntil: 'April 15, 2027', plus: '$249', expert: '$299' });

export const US_FORMS = Object.freeze(['1040', 'Schedule 1', 'Schedule 2', 'Schedule 3', 'Schedule A', 'Schedule B', 'Schedule C', 'Schedule D', 'Schedule SE', 'Form 8949', 'Form 8812', 'Form 8863', 'Form 8995', 'W-2', '1099-INT', '1099-DIV', '1099-B', '1099-NEC', '1099-MISC', '1099-G', '1099-R', 'SSA-1099', '1098', '1098-E', '1098-T']);

const INDIA_CTA = { label: 'Get MyCA for Android', note: 'Every plan starts with 14 days of Pro.' };
const US_CTA = { label: 'See what is in it', href: '/us#forms', note: 'MyCA US opens for the 2026 tax year in January 2027.' };

export const PAGES = [
  {
    slug: 'gst-billing-software',
    edition: 'india',
    title: 'GST billing software for small businesses | MyCA',
    description: 'Make GST invoices on your phone by typing a sentence. MyCA works out CGST, SGST or IGST, keeps the books and builds GSTR-1 from them. 14 days of Pro to start.',
    eyebrow: 'GST billing',
    h1: 'GST billing that keeps your books while you bill.',
    lede: 'Type "sold 20 shirts to Kiran Stores for 8,000 plus GST". MyCA shows the invoice it is about to make, with the right tax split for the buyer\'s state. Say yes and it is in your books and your GSTR-1.',
    cta: INDIA_CTA,
    points: [
      ['The tax split is worked out for you', 'CGST and SGST inside your state, IGST across states, from the place of supply on the invoice. Rates come from dated rules you can read.'],
      ['Invoices you can share at once', 'Send the PDF on WhatsApp from your phone, and remind the customer from MyCA when it falls due.'],
      ['Every invoice feeds the return', 'Sales flow into GSTR-1 and GSTR-3B. There is nothing to re-type at month end.'],
      ['Your CA sees the same books', 'Invite your accountant. They work in the same records, and every change shows who made it.'],
    ],
    faq: [
      ['Is MyCA free?', `No. MyCA starts with 14 days of Pro. After that Essentials is ${INDIA_PRICES.essentials} a month and Pro is ${INDIA_PRICES.pro} a month, with a discount by the year. If you do not pick a plan, your books stay readable and exportable.`],
      ['Can I make e-invoices?', 'Yes, on Pro. MyCA prepares the e-invoice and gets the IRN when you confirm.'],
      ['Can I bring my old invoices from Tally?', 'Yes. MyCA reads a Tally export, a Zoho Books file or a bank statement, and you can start fresh instead.'],
    ],
    related: ['gst-return-filing', 'e-invoice-software', 'tally-alternative'],
  },
  {
    slug: 'gst-return-filing',
    edition: 'india',
    title: 'File GSTR-1 and GSTR-3B from your books | MyCA',
    description: 'MyCA builds GSTR-1 and GSTR-3B from the invoices and bills already in your books, shows how each figure was reached, and files on the GST portal with your approval.',
    eyebrow: 'GST returns',
    h1: 'GSTR-1 and GSTR-3B, already worked out.',
    lede: 'Your return is a view of your books, not a spreadsheet you fill in. Open the month, check the figures, and see the invoice and the rule behind each one.',
    cta: INDIA_CTA,
    points: [
      ['Built from what you recorded', 'Sales go to GSTR-1 tables, bills and expenses give input tax credit for GSTR-3B. Nothing is typed twice.'],
      ['Checked against GSTR-2B', 'MyCA matches your purchase bills to what suppliers reported and shows what is missing before you claim it.'],
      ['Filed only when you say so', 'On Pro, MyCA files on the GST portal after you, or your CA, approve the figures. It never holds your portal password.'],
      ['Due dates on your home screen', 'MyCA reminds you before the 11th and the 20th, and on the phone itself, not by a call centre.'],
    ],
    faq: [
      ['Does MyCA file the return for me?', 'On Pro it can, after you or your CA approve. On Essentials MyCA works out the return and you file it yourself.'],
      ['What if a supplier has not filed?', 'The GSTR-2B check marks the bill as not yet reported, so you can hold the credit and remind the supplier.'],
      ['Can my CA review before filing?', 'Yes. Invite your CA as an accountant. Filing waits for their approval when you ask it to.'],
    ],
    related: ['gst-billing-software', 'accounting-app-for-ca-firms', 'e-invoice-software'],
  },
  {
    slug: 'e-invoice-software',
    edition: 'india',
    title: 'E-invoice software with IRN and QR code | MyCA',
    description: 'Create GST e-invoices from your phone. MyCA prepares the e-invoice from your sale, gets the IRN and signed QR code, and keeps them with the invoice in your books.',
    eyebrow: 'E-invoicing',
    h1: 'E-invoices without the JSON.',
    lede: 'If your turnover needs e-invoicing, MyCA prepares it from the sale you just recorded, gets the IRN when you confirm, and prints the signed QR code on the invoice.',
    cta: INDIA_CTA,
    points: [
      ['From the sale you already made', 'No separate upload. The invoice in your books is the e-invoice.'],
      ['Checked before it is sent', 'GSTINs, HSN codes and totals are checked first, so a rejection is rare and explained in plain words when it happens.'],
      ['Cancel inside the window', 'MyCA shows how long you have to cancel, and records why.'],
      ['E-way bills when goods move', 'Generate the e-way bill from the same invoice.'],
    ],
    faq: [
      ['Which plan includes e-invoicing?', `Pro, at ${INDIA_PRICES.pro} a month or less by the year.`],
      ['Do I need my own GSP?', 'No. MyCA connects through its GST partner.'],
    ],
    related: ['gst-billing-software', 'gst-return-filing', 'tally-alternative'],
  },
  {
    slug: 'tally-alternative',
    edition: 'india',
    title: 'A Tally alternative you can use on your phone | MyCA',
    description: 'Move from Tally to MyCA without losing history: bring in your Tally export, keep billing on your phone, and send your CA a Tally file whenever they ask.',
    eyebrow: 'Moving from Tally',
    h1: 'Keep your Tally history. Lose the desk.',
    lede: 'MyCA reads your Tally export so your parties, balances and invoices come with you. Your CA still gets a Tally file whenever they want one, free on every plan.',
    cta: INDIA_CTA,
    points: [
      ['Bring your books in', 'Parties, opening balances and past invoices come in from a Tally export.'],
      ['Bill from anywhere', 'Record a sale or a bill by typing a sentence or taking a photo, on your phone.'],
      ['Your CA keeps their tools', 'Export a Tally file, the return files or everything, free on every plan.'],
      ['A Windows app too', 'For a desk or a CA firm, the Windows app keeps everything on your own PC.'],
    ],
    faq: [
      ['Will my CA be able to use it?', 'Yes. Invite them as an accountant, or send them a Tally file.'],
      ['Is my data safe if I leave?', 'A full export is free on every plan, and deleting your account is a button.'],
    ],
    related: ['gst-billing-software', 'accounting-app-for-ca-firms', 'gst-return-filing'],
  },
  {
    slug: 'accounting-app-for-ca-firms',
    edition: 'india',
    title: 'Accounting app for CA firms and their clients | MyCA',
    description: 'Give every client books they keep themselves on the phone, and approve their GST filings from one place. MyCA CA firm plan: 25 people across the firm.',
    eyebrow: 'For CA firms',
    h1: 'Your clients keep the books. You approve.',
    lede: 'Clients record sales and bills as they happen. You see the same books, fix what needs fixing, and approve returns before they are filed.',
    cta: { label: 'Set up your firm', note: `CA firm plan: ${INDIA_PRICES.firm} a month, 25 people.` },
    points: [
      ['One login, every client', 'Switch between client businesses from one account.'],
      ['Approve before anything is filed', 'Filing waits for a CA approval. The approval is recorded with the figures you approved.'],
      ['Every figure can be traced', 'To the invoice, the rule, the section of the Act and the date the rule took effect.'],
      ['Live, daily or month-end views', 'Each client chooses when you see their books: as it happens, daily, weekly or at month end.'],
    ],
    faq: [
      ['How many people can use the firm plan?', 'Twenty-five across the firm.'],
      ['Do clients pay separately?', 'Each client business has its own plan. The firm plan covers the people in your firm.'],
    ],
    related: ['gst-return-filing', 'tally-alternative', 'gst-billing-software'],
  },
  {
    slug: 'us',
    edition: 'us',
    title: 'MyCA US: file your federal tax return with every figure explained',
    description: `Prepare your 2026 federal return free on your phone and see your refund first. Every line explained. Pay only when you file: ${US_PRICES.returnLaunch} through ${US_PRICES.launchUntil}.`,
    eyebrow: 'MyCA US',
    h1: 'Your federal return, with every line explained.',
    lede: 'Photograph your W-2s and 1099s. MyCA fills in Form 1040 and its schedules, shows which rule produced each number, and tells you plainly what it cannot handle before you pay.',
    cta: US_CTA,
    points: [
      ['Every number has a reason', 'Tap any line to see the form, the rule and the IRS instruction behind it.'],
      ['Told up front what is not supported', 'If your return needs a form MyCA does not handle yet, you find out before you pay, not after.'],
      ['Self-employed and investors too', 'Schedule C, Schedule SE, Schedule D and Form 8949, the QBI deduction and education credits are in from day one.'],
      ['Free to prepare, pay only to file', `Preparing your return and seeing your refund are free. Filing is ${US_PRICES.returnList}, or ${US_PRICES.returnLaunch} through ${US_PRICES.launchUntil}. MyCA Plus is ${US_PRICES.plus} a year for estimated payments, a withholding check and help with IRS letters.`],
    ],
    faq: [
      ['When can I file?', 'MyCA US opens for the 2026 tax year in January 2027.'],
      ['Does it do state returns?', 'Not this season. MyCA gives you a carry-over sheet with the federal figures your state return needs.'],
      ['What if MyCA makes a mistake?', 'If a mistake in MyCA\'s calculations means your federal return needs to be corrected, we fix it and you file the correction at no extra charge. This promise does not cover IRS penalties or interest.'],
      ['Can a tax professional review my return?', 'Expert Review is coming soon, and you can join the waitlist in the app. Until then you can share your return with your own tax professional from the app.'],
      ['Is MyCA connected to the IRS?', 'No. MyCA is not affiliated with the IRS or any government agency. Your return is e-filed through our IRS-authorized e-file partner.'],
    ],
    related: ['us/self-employed-tax-return'],
  },
  {
    slug: 'us/self-employed-tax-return',
    edition: 'us',
    title: 'Self-employed tax return with Schedule C and SE | MyCA US',
    description: 'Freelancers, contractors and gig workers: MyCA US prepares Schedule C, Schedule SE and the QBI deduction from your 1099-NEC and expenses, and explains every figure.',
    eyebrow: 'Self-employed',
    h1: 'Freelance income, without the guesswork.',
    lede: 'Add your 1099-NEC and 1099-MISC forms and your business expenses. MyCA prepares Schedule C, works out self-employment tax on Schedule SE and applies the qualified business income deduction.',
    cta: US_CTA,
    points: [
      ['Schedule C from your records', 'Income from 1099-NEC and 1099-MISC, and your expenses on the right Schedule C lines, each with the IRS instruction behind it.'],
      ['Self-employment tax worked out', 'Schedule SE, with half of it deducted on Schedule 1 automatically.'],
      ['QBI deduction applied', 'Form 8995 for the 20% qualified business income deduction where you qualify.'],
      ['Year-round with Plus', `MyCA Plus (${US_PRICES.plus} a year) works out quarterly estimated payments, checks your withholding and reads IRS letters.`],
    ],
    faq: [
      ['Do I need a separate business account?', 'No, but separating business expenses makes Schedule C easier, and MyCA can read a bank feed for them.'],
      ['Are quarterly estimated payments included?', 'MyCA Plus works out each quarterly payment and shows the due dates.'],
    ],
    related: ['us'],
  },
];

export const GUIDE_INDEX = {
  slug: 'guides',
  title: 'Guides to GST, books and US taxes | MyCA',
  description: 'Plain-language guides to GST billing, GST returns, e-invoicing, moving from Tally, CA firm workflows and US federal returns, from the makers of MyCA.',
  h1: 'Guides',
};
