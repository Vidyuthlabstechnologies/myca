// Hindi wording for the account screens of the India app, keyed by the English line (or template with {names}).
// Needs a native speaker's review before launch: see docs/product/INDIA-LANGUAGES.md.

const hiAccount = <String, String>{
  // Welcome
  'GST and due dates worked out for you': 'GST और आखिरी तारीख़ें, सब आपके लिए तैयार',
  'Your books,{br}kept as easily{br}as a conversation.': 'आपका हिसाब-किताब,{br}बातचीत जितना{br}आसान।',
  'Sales, purchases and GST for your business, kept right without the paperwork.': 'आपके कारोबार की बिक्री, खरीद और GST, बिना कागज़ी झंझट के सही-सही।',
  'Take a 2-minute tour first': 'पहले 2 मिनट का टूर देखें',

  // Sign in
  'That user does not exist.': 'यह यूज़र मौजूद नहीं है।',
  'Wrong PIN. Try again.': 'PIN गलत है। फिर से कोशिश करें।',
  'This user has no PIN yet. Set one in MyCA on Windows.': 'इस यूज़र का अभी कोई PIN नहीं है। Windows वाले MyCA में PIN बनाएँ।',
  'Too many wrong attempts. This user is locked.': 'बहुत बार गलत PIN डाला गया। यह यूज़र लॉक हो गया है।',
  'Could not sign in ({code}).': 'साइन इन नहीं हो सका ({code})।',
  'Mobile number': 'मोबाइल नंबर',

  // Business set-up
  'Choose the state your business is in.': 'चुनें कि आपका कारोबार किस राज्य में है।',
  'You have been invited': 'आपको बुलाया गया है',
  'This goes on your invoices and returns.': 'यह आपके बिलों और रिटर्न पर छपेगा।',
  'Leave empty if you are not registered for GST': 'अगर GST में रजिस्टर नहीं हैं तो खाली छोड़ दें',
  'State': 'राज्य',
  'Could not load the list of states.': 'राज्यों की लिस्ट नहीं खुल सकी।',
  'Try a demo business first': 'पहले डेमो कारोबार चलाकर देखें',
  'A made-up trader with three months of invoices, purchases and expenses. It cannot reach the GST portal, banks or other people, and you can delete it any time.':
      'एक नकली व्यापारी, जिसके तीन महीने के बिल, खरीद और खर्चे भरे हैं। यह GST पोर्टल, बैंक या किसी और तक नहीं पहुँच सकता, और आप इसे कभी भी हटा सकते हैं।',
  'MyCA did not accept that ({error}). Check the GSTIN.': 'MyCA ने इसे नहीं माना ({error})। GSTIN जाँच लें।',

  // Business sheet
  'Not registered for GST': 'GST में रजिस्टर नहीं',
  'Plan and billing': 'प्लान और पेमेंट',
  'Your plan, trial and what it includes': 'आपका प्लान, ट्रायल और उसमें क्या-क्या मिलता है',
  'Connections to banks and apps': 'बैंक और ऐप से जुड़ाव',
  'Amazon, Shopify, Razorpay and Zoho': 'Amazon, Shopify, Razorpay और Zoho',
  'Only what went wrong in the app. Names, amounts, GSTINs and phone numbers are removed before it leaves the phone.':
      'सिर्फ़ ऐप में क्या गड़बड़ हुई। फ़ोन से जाने से पहले नाम, रकम, GSTIN और फ़ोन नंबर हटा दिए जाते हैं।',

  // Your businesses
  'Its books, documents and members go with it. Backups are kept for fourteen days, after which it cannot be recovered.':
      'इसके खाते, कागज़ात और सदस्य भी साथ में हट जाएँगे। बैकअप चौदह दिन तक रखा जाता है, उसके बाद इसे वापस नहीं लाया जा सकता।',
  'Privacy notice, terms, Grievance Officer, and requests to see, correct or erase your data': 'प्राइवेसी नोटिस, शर्तें, शिकायत अधिकारी, और अपना डेटा देखने, सुधारने या मिटाने की अर्ज़ी',

  // Plan and billing
  'Google Play is processing the payment. The plan starts as soon as it clears.': 'Google Play पेमेंट पूरा कर रहा है। पेमेंट होते ही प्लान शुरू हो जाएगा।',
  'Google Play did not complete the payment. Nothing was charged.': 'Google Play पर पेमेंट पूरा नहीं हुआ। कोई पैसा नहीं कटा।',
  'Thank you. The plan is on for this business.': 'धन्यवाद। इस कारोबार के लिए प्लान चालू हो गया है।',
  'Thank you. {plan} is on for this business.': 'धन्यवाद। इस कारोबार के लिए {plan} चालू हो गया है।',
  'The payment went through but MyCA could not confirm it yet. It will be picked up automatically.': 'पेमेंट हो गया, पर MyCA अभी इसकी पुष्टि नहीं कर सका। यह अपने-आप दर्ज हो जाएगा।',
  'Google Play could not open the payment. Check that you are signed in to the Play Store and try again.': 'Google Play पेमेंट नहीं खोल सका। देख लें कि Play Store में साइन इन है, फिर से कोशिश करें।',
  'This is a Google Play test purchase: no real money is taken.': 'यह Google Play की टेस्ट खरीद है: असली पैसा नहीं कटेगा।',
  '{plan} (current)': '{plan} (अभी वाला)',
  'Opening soon. It opens once the professional who reviews and files is named here.': 'जल्द शुरू होगा। जाँचने और फ़ाइल करने वाले प्रोफ़ेशनल का नाम यहाँ आते ही यह खुल जाएगा।',
  'Your reviewing professional: {name}': 'आपके जाँचने वाले प्रोफ़ेशनल: {name}',
  'Subscribe to {plan}': '{plan} लें',
  'Manage or cancel in Google Play': 'Google Play में बदलें या बंद करें',
  'To switch plans, cancel in Google Play and subscribe to the other plan when this one ends.': 'प्लान बदलने के लिए Google Play में यह प्लान बंद करें, और इसके खत्म होने पर दूसरा प्लान लें।',
  'Only the owner can change the plan.': 'प्लान सिर्फ़ मालिक बदल सकते हैं।',
  'MyCA is software. It is not a firm of chartered accountants and does not give tax or legal advice. You approve every return before it is filed.':
      'MyCA एक सॉफ़्टवेयर है। यह चार्टर्ड अकाउंटेंट की फ़र्म नहीं है और टैक्स या कानूनी सलाह नहीं देता। हर रिटर्न फ़ाइल होने से पहले आप ही उसे मंज़ूर करते हैं।',
  'Plans are bought from Google Play in the MyCA Android app. A plan bought there works here too.': 'प्लान MyCA के Android ऐप में Google Play से खरीदे जाते हैं। वहाँ खरीदा प्लान यहाँ भी चलता है।',
  'See and export your books': 'अपने खाते देखें और डाउनलोड करें',
  'Unlimited invoices, bills, receipts and payments': 'जितने चाहें बिल, खरीद बिल, रसीद और पेमेंट',
  'GSTR-1 and GSTR-3B worked out from your books': 'आपके खातों से GSTR-1 और GSTR-3B तैयार',
  'File GSTR-1 and GSTR-3B on the GST portal, with your CA\'s approval': 'आपके CA की मंज़ूरी से GST पोर्टल पर GSTR-1 और GSTR-3B फ़ाइल करें',
  'Ask MyCA in plain words': 'MyCA से अपनी बोली में पूछें',
  'E-invoices (IRN) and GSTIN checks': 'ई-इनवॉइस (IRN) और GSTIN की जाँच',
  'Amazon, Shopify, Razorpay, Zoho and bank connections': 'Amazon, Shopify, Razorpay, Zoho और बैंक से जुड़ाव',
  'Ask and post on WhatsApp': 'WhatsApp पर पूछें और एंट्री करें',
  'Staff and your accountant in the same books': 'स्टाफ़ और आपके अकाउंटेंट, एक ही खाते में',
  'An independent GST practitioner or chartered accountant, named before you subscribe, reviews and files your GST and TDS returns every month. That professional, not MyCA, is responsible for their work':
      'एक स्वतंत्र GST प्रैक्टिशनर या चार्टर्ड अकाउंटेंट, जिनका नाम प्लान लेने से पहले बताया जाता है, हर महीने आपके GST और TDS रिटर्न जाँचकर फ़ाइल करते हैं। अपने काम की ज़िम्मेदारी उन्हीं की है, MyCA की नहीं',
  'Correction promise: if a return filed through MyCA is wrong because of an error in MyCA, we prepare the correction at no charge. Interest, late fees and penalties are not covered':
      'सुधार का वादा: अगर MyCA से फ़ाइल हुआ रिटर्न MyCA की गलती से गलत निकले, तो हम बिना पैसे लिए सुधार तैयार करेंगे। ब्याज, लेट फ़ीस और जुर्माना इसमें शामिल नहीं',
  'Priority support': 'पहले मदद',
  'Unlimited invoices, any number of people': 'जितने चाहें बिल, जितने चाहें लोग',
  'Unlimited invoices, just you': 'जितने चाहें बिल, सिर्फ़ आप',
  'Unlimited invoices, up to {people} people': 'जितने चाहें बिल, {people} लोगों तक',
  '{invoices} invoices a month, any number of people': 'महीने में {invoices} बिल, जितने चाहें लोग',
  '{invoices} invoices a month, just you': 'महीने में {invoices} बिल, सिर्फ़ आप',
  '{invoices} invoices a month, up to {people} people': 'महीने में {invoices} बिल, {people} लोगों तक',
  '{price} a month on Google Play, GST included': 'Google Play पर {price} महीना, GST मिलाकर',
  '{price} a month plus GST': '{price} महीना, ऊपर से GST',
  'Renews every month at {price} until you cancel. Cancel any time in Google Play, Subscriptions; the plan runs to the end of the month you paid for. Google Play handles refunds.':
      'जब तक आप बंद न करें, हर महीने {price} में चलता रहेगा। Google Play में Subscriptions से कभी भी बंद करें; जिस महीने का पैसा दिया है, उसके आखिर तक प्लान चलेगा। रिफ़ंड Google Play देखता है।',
  'Renews every month at {price} plus GST until you cancel. Cancel any time in Google Play, Subscriptions; the plan runs to the end of the month you paid for. Google Play handles refunds.':
      'जब तक आप बंद न करें, हर महीने {price} और GST में चलता रहेगा। Google Play में Subscriptions से कभी भी बंद करें; जिस महीने का पैसा दिया है, उसके आखिर तक प्लान चलेगा। रिफ़ंड Google Play देखता है।',
  'Free trial of {plan}: 1 day left.': '{plan} का फ़्री ट्रायल: 1 दिन बचा है।',
  'Free trial of {plan}: {n} days left.': '{plan} का फ़्री ट्रायल: {n} दिन बचे हैं।',
  'Google Play is still processing the payment. The plan starts as soon as it clears.': 'Google Play अभी पेमेंट पूरा कर रहा है। पेमेंट होते ही प्लान शुरू हो जाएगा।',
  'Google Play could not take the last payment, so the books are read-only. Fix the payment method in Google Play to get the plan back.':
      'Google Play पिछला पेमेंट नहीं ले सका, इसलिए खाते अभी सिर्फ़ देखने के लिए हैं। प्लान वापस पाने के लिए Google Play में पेमेंट का तरीका ठीक करें।',
  'The free trial has ended, so the books are read-only: you can still see, ask and export. Choose a plan to post again.':
      'फ़्री ट्रायल खत्म हो गया है, इसलिए खाते सिर्फ़ देखने के लिए हैं: आप अब भी देख, पूछ और डाउनलोड कर सकते हैं। फिर से एंट्री करने के लिए प्लान चुनें।',
  'You are on {plan}. It will not renew.': 'आप {plan} पर हैं। यह आगे नहीं बढ़ेगा।',
  'You are on {plan} until {date}. It will not renew.': 'आप {date} तक {plan} पर हैं। यह आगे नहीं बढ़ेगा।',
  'You are on {plan}.': 'आप {plan} पर हैं।',
  'You are on {plan}, renews {date}.': 'आप {plan} पर हैं, {date} को आगे बढ़ेगा।',

  // Privacy
  'Off unless you tick it. Only what went wrong in the app, with names, amounts, GSTINs and phone numbers removed. You can change this later under Your business.':
      'जब तक आप टिक न करें, बंद रहेगा। सिर्फ़ ऐप में क्या गड़बड़ हुई, नाम, रकम, GSTIN और फ़ोन नंबर हटाकर। इसे बाद में "आपका कारोबार" में बदल सकते हैं।',
  'See what MyCA holds about me': 'MyCA के पास मेरी क्या जानकारी है, देखें',
  'A summary of your personal data and who it was shared with': 'आपके निजी डेटा का सार, और यह किसके साथ साझा हुआ',
  'Correct or complete my information': 'मेरी जानकारी सुधारें या पूरी करें',
  'Tell us what is wrong': 'बताएँ क्या गलत है',
  'Erase my information': 'मेरी जानकारी मिटाएँ',
  'Something you cannot delete yourself in the app': 'जो आप ऐप में खुद नहीं हटा सकते',
  'Withdraw my consent': 'अपनी सहमति वापस लें',
  'We stop using your information; your account is closed': 'हम आपकी जानकारी का इस्तेमाल बंद कर देंगे; आपका अकाउंट बंद हो जाएगा',
  'Nominate someone to act for me': 'मेरी जगह काम के लिए किसी को नामित करें',
  'If you die or cannot act yourself': 'अगर आप न रहें या खुद कुछ न कर सकें',
  'Make a complaint': 'शिकायत करें',
  'Goes to the Grievance Officer': 'शिकायत अधिकारी के पास जाती है',
  'Their name': 'उनका नाम',
  'Their phone number or email': 'उनका फ़ोन नंबर या ईमेल',
  'Under the Digital Personal Data Protection Act, 2023. Every request gets a reference number and an answer within 30 days. If you are not satisfied, you can complain to the Data Protection Board of India.':
      'डिजिटल पर्सनल डेटा प्रोटेक्शन एक्ट, 2023 के तहत। हर अर्ज़ी को एक रेफ़रेंस नंबर मिलता है और 30 दिन के अंदर जवाब। अगर आप संतुष्ट न हों, तो डेटा प्रोटेक्शन बोर्ड ऑफ़ इंडिया में शिकायत कर सकते हैं।',
  'Tap to write to them': 'उन्हें लिखने के लिए टैप करें',
  'Terms of service': 'सेवा की शर्तें',
  'Refunds and cancellation': 'रिफ़ंड और कैंसिल करना',
  'Grievance redressal': 'शिकायत निवारण',
  'MyCA is software by ML Dynamic Solutions Private Limited. It is not a firm of chartered accountants and does not give tax or legal advice. You approve every return before it is filed.':
      'MyCA, ML Dynamic Solutions Private Limited का सॉफ़्टवेयर है। यह चार्टर्ड अकाउंटेंट की फ़र्म नहीं है और टैक्स या कानूनी सलाह नहीं देता। हर रिटर्न फ़ाइल होने से पहले आप ही उसे मंज़ूर करते हैं।',
  'Open, answer due by {date}': 'खुला, जवाब {date} तक',

  // Connections to banks and apps
  'Seller Central → Apps and Services → Develop apps: create a private SP-API app, note the LWA client id and secret, and authorise it to get the refresh token. Marketplace id is A21TJRUUN4KGV for India; region IN.':
      'Seller Central → Apps and Services → Develop apps: एक private SP-API ऐप बनाएँ, LWA client id और secret लिख लें, और refresh token पाने के लिए उसे मंज़ूरी दें। भारत के लिए Marketplace id A21TJRUUN4KGV है; region IN।',
  'Shopify admin → Settings → Apps and sales channels → Develop apps: create an app with read_orders and read_shopify_payments_payouts, install it, and copy the Admin API access token. Shop domain is the myshopify.com host.':
      'Shopify admin → Settings → Apps and sales channels → Develop apps: read_orders और read_shopify_payments_payouts वाला ऐप बनाएँ, इंस्टॉल करें, और Admin API access token कॉपी करें। Shop domain आपका myshopify.com वाला पता है।',
  'Razorpay dashboard → Account & Settings → API Keys: generate the key id and secret (test or live).': 'Razorpay dashboard → Account & Settings → API Keys: key id और secret बनाएँ (test या live)।',
  'Zoho API console → Self Client: create a client, generate a code for ZohoBooks.fullaccess.all, exchange it for a refresh token; org id from Zoho Books settings; dc is in for India.':
      'Zoho API console → Self Client: एक client बनाएँ, ZohoBooks.fullaccess.all के लिए code बनाएँ, उसके बदले refresh token लें; org id, Zoho Books की settings में मिलेगा; भारत के लिए dc in है।',
  'Live (real portal)': 'लाइव (असली पोर्टल)',
  'Test (sandbox)': 'टेस्ट (sandbox)',
  'Pull settlement': 'सेटलमेंट लाएँ',
  'Pull payouts': 'पेआउट लाएँ',
  'Pull settlements': 'सेटलमेंट लाएँ',
  'Pull now': 'अभी लाएँ',
  'Not connected': 'जुड़ा नहीं',
  'Connected': 'जुड़ा हुआ',
  'Saved, paused': 'सेव है, रुका हुआ',
  'Marketplaces, payment gateways and Zoho Books. Keys stay on the MyCA server, encrypted; nothing posts to the books without you.':
      'मार्केटप्लेस, पेमेंट गेटवे और Zoho Books। Keys MyCA के सर्वर पर ताले में (encrypted) रहती हैं; आपके बिना खाते में कुछ दर्ज नहीं होता।',
  'Pulls are switched off on the service, so Pull now runs as a dry run.': 'सर्विस पर लाना बंद है, इसलिए "अभी लाएँ" सिर्फ़ आज़माइश के तौर पर चलेगा।',
  'Saving…': 'सेव हो रहा है…',
  'Resuming…': 'फिर से चालू हो रहा है…',
  'Pausing…': 'रोका जा रहा है…',
  'Resumed.': 'फिर से चालू हो गया।',
  'Paused; nothing is pulled until you resume.': 'रोक दिया; जब तक फिर से चालू न करें, कुछ नहीं लाया जाएगा।',
  'Pulling…': 'लाया जा रहा है…',
  'Mode': 'मोड',
  '(saved)': '(सेव है)',
  'Optional': 'ज़रूरी नहीं',
  'Pause': 'रोकें',
  'Resume': 'फिर से चालू करें',
  'Nothing was pulled for {name}.': '{name} से कुछ नहीं आया।',
  'Pulled to {date}': '{date} तक लाया गया',

  // Home
  'MSME suppliers': 'MSME सप्लायर',
  'TAX ON SALES, {month}': 'बिक्री पर टैक्स, {month}',
  'Credit on purchases {amount}': 'खरीद पर क्रेडिट {amount}',
  '{amount} open': '{amount} बाकी',
  'Next: {name} by {date} · {amount} open': 'अगला: {name}, {date} तक · {amount} बाकी',
  'Pay {name} {amount} on {bill} (MSME)': '{name} को {bill} के {amount} दें (MSME)',
  'Pay {name} {amount} on {bill}': '{name} को {bill} के {amount} दें',
  '1 sale': '1 बिक्री',
  '{n} sales': '{n} बिक्री',
  '1 bill past the MSMED limit': '1 बिल MSMED की समय-सीमा पार कर गया',
  '{n} bills past the MSMED limit': '{n} बिल MSMED की समय-सीमा पार कर गए',
  '1 MSME bill to pay inside the limit': '1 MSME बिल समय-सीमा के अंदर चुकाना है',
  '{n} MSME bills to pay inside the limit': '{n} MSME बिल समय-सीमा के अंदर चुकाने हैं',
  '{amount} not deductible until paid · 1 MSME bill open': '{amount} चुकाने तक खर्च में नहीं गिना जाएगा · 1 MSME बिल बाकी',
  '{amount} not deductible until paid · {n} MSME bills open': '{amount} चुकाने तक खर्च में नहीं गिना जाएगा · {n} MSME बिल बाकी',

  // Tour
  'Next': 'आगे',
  'Show me around': 'मुझे घुमाइए',
  'Namaste! I\'m {name}. This is Nalanda Textiles, a sample shop. Everything here is pretend, so tap anything you like. Your own books are not touched.':
      'नमस्ते! मैं {name} हूँ। यह Nalanda Textiles है, एक नमूने की दुकान। यहाँ सब कुछ नकली है, जो चाहें टैप करें। आपके अपने खाते को कोई हाथ नहीं लगता।',
  'The top card is your day at a glance: GST you owe this month, and anything that needs you before a filing.':
      'ऊपर वाले कार्ड में आपका पूरा दिन एक नज़र में: इस महीने कितना GST देना है, और रिटर्न से पहले कौन-सा काम आपका इंतज़ार कर रहा है।',
  'Let\'s log a sale. Tap New entry, then I sold something, and pick {customer}.': 'चलिए एक बिक्री दर्ज करें। "नई एंट्री" टैप करें, फिर "मैंने कुछ बेचा", और {customer} चुनें।',
  'Type an amount, say 8000, choose 18% GST, then tap Preview. MyCA works out the tax.': 'कोई रकम लिखें, जैसे 8000, 18% GST चुनें, फिर "पहले देखें" टैप करें। टैक्स MyCA निकाल देगा।',
  'This is only a preview. Nothing reaches your books until you tap Post it.': 'यह सिर्फ़ झलक है। जब तक आप "दर्ज करें" टैप नहीं करते, खाते में कुछ नहीं चढ़ता।',
  'Posted! The invoice is in the customer\'s thread, and GST is already counted for this month.': 'दर्ज हो गया! बिल ग्राहक के खाते में है, और इस महीने का GST पहले ही जुड़ गया है।',
  'Here is what you owe. Tax on sales, less credit on purchases, and the due date for each filing.': 'यह रहा आपको कितना देना है। बिक्री पर टैक्स, खरीद का क्रेडिट घटाकर, और हर रिटर्न की आखिरी तारीख़।',
  'Rent, fuel, tea for the staff: log expenses here. MyCA picks the head and tells you why.': 'किराया, पेट्रोल, स्टाफ़ की चाय: खर्चे यहाँ दर्ज करें। MyCA खाता-हेड चुनता है और वजह भी बताता है।',
  'When something looks off, like a bank line that matches nothing, it shows up here with the reason.': 'जब कुछ गड़बड़ लगे, जैसे बैंक की कोई एंट्री किसी से न मिले, तो वह वजह के साथ यहाँ दिखती है।',
  'And you can just ask, in English or Hinglish. Try "Who owes me?"': 'और आप सीधे पूछ सकते हैं, हिंदी, अंग्रेज़ी या Hinglish में। पूछकर देखें "मुझे किससे पैसे लेने हैं?"',
  'That\'s MyCA! Ready to set up your own books? It takes about two minutes.': 'यह है MyCA! अपने खाते शुरू करें? करीब दो मिनट लगते हैं।',
  'Start my books': 'मेरे खाते शुरू करें',
  'End tour': 'टूर बंद करें',
  'Show me': 'दिखाइए',
  'Skip ahead': 'छोड़कर आगे',
  '{name} · {step} of {count}': '{name} · {count} में से {step}',
};
