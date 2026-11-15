import 'package:flutter/widgets.dart';

import '../app_state.dart';

const indiaLocales = [Locale('en', 'US'), Locale('hi', 'IN')];

Locale indiaResolveLocale(Locale? device, Iterable<Locale> supported) => device?.languageCode == 'hi' ? indiaLocales.last : indiaLocales.first;

bool indiaHindi(BuildContext context) {
  if (Localizations.maybeLocaleOf(context)?.languageCode != 'hi') return false;
  final state = AppScope.of(context);
  return state.edition == 'IN' && (state.snapshot?.company.country ?? 'IN') == 'IN';
}

String inText(BuildContext context, String english) => indiaHindi(context) ? (indiaHindiText[english] ?? english) : english;

String inThingsNeedYou(BuildContext context, int count) {
  if (!indiaHindi(context)) return count == 1 ? '1 thing needs you' : '$count things need you';
  return count == 1 ? '1 काम आपका इंतज़ार कर रहा है' : '$count काम आपका इंतज़ार कर रहे हैं';
}

const indiaHindiText = <String, String>{
  'Your business': 'आपका कारोबार',
  'New entry': 'नई एंट्री',
  'Your books': 'आपके बही-खाते',
  'Sales': 'बिक्री',
  'Purchases': 'खरीद',
  'Expenses': 'खर्चे',
  'Employees': 'कर्मचारी',
  'Who works for you and what they are paid': 'आपके यहाँ कौन काम करता है और उन्हें कितना वेतन मिलता है',
  'Money and follow-up': 'पैसा और फ़ॉलो-अप',
  'Cash': 'नकदी',
  'Bank and cash, the next 30 days, and can I afford it': 'बैंक और नकदी, अगले 30 दिन, और क्या मैं यह खर्च उठा सकता हूँ',
  'Marketplace': 'मार्केटप्लेस',
  'Payouts, TCS and TDS, margins by SKU, stock, GST registrations': 'भुगतान, TCS और TDS, हर SKU का मार्जिन, स्टॉक, GST पंजीकरण',
  'Bank': 'बैंक',
  'Your statement next to your books, matched and not matched': 'आपका बैंक स्टेटमेंट और आपके खाते साथ-साथ, क्या मिला और क्या नहीं',
  'Repeating entries': 'दोहराई जाने वाली एंट्री',
  'Invoices, bills and expenses posted on their dates': 'बिक्री बिल, खरीद बिल और खर्चे जो अपनी तारीख़ पर दर्ज होते हैं',
  'Reports': 'रिपोर्ट',
  'Saved reports run by name, compared with the period before': 'सहेजी गई रिपोर्ट नाम से चलाएँ, पिछली अवधि से तुलना के साथ',
  'Statements': 'वित्तीय विवरण',
  'Profit and loss, balance sheet, cash flow, customer statements': 'लाभ-हानि, बैलेंस शीट, कैश फ़्लो, ग्राहकों के खाते',
  'Your CA': 'आपके CA',
  'Questions you asked and their answers': 'आपके पूछे सवाल और उनके जवाब',
  'Reminders': 'रिमाइंडर',
  'Anything you asked to be reminded of': 'जो भी आपने याद दिलाने को कहा',
  'Books check': 'खातों की जाँच',
  'What needs you, worked out from your books': 'आपके खातों से निकाला गया: किस काम में आपकी ज़रूरत है',
  'Got it': 'ठीक है',
  'Could not check your taxes': 'आपके टैक्स की जाँच नहीं हो सकी',
  'Checking your books…': 'आपके खाते जाँचे जा रहे हैं…',
  'You are all caught up': 'आपका सारा काम पूरा है',
  'Pull down to try again.': 'दोबारा कोशिश के लिए नीचे खींचें।',
  'No returns overdue and nothing waiting on you.': 'कोई रिटर्न बकाया नहीं है और कुछ भी आपके लिए रुका नहीं है।',
  'TAXES AND FILINGS': 'टैक्स और रिटर्न',
  'Overdue': 'समय निकल गया',
  'Due soon': 'जल्द देय',
  'Log your first sale': 'अपनी पहली बिक्री दर्ज करें',
  'Name the customer, enter the amount, confirm.': 'ग्राहक का नाम लिखें, रकम डालें, पुष्टि करें।',
  'Sold': 'बेचा',
  'Bought': 'खरीदा',
  'Spent': 'खर्च किया',
  'Paid staff': 'वेतन दिया',
  'Owed to you': 'आपको मिलना है',
  'No invoice is waiting for payment.': 'किसी बिल का भुगतान बाकी नहीं है।',
  'You owe suppliers': 'आपको सप्लायर को देना है',
  'No bill is waiting to be paid.': 'कोई खरीद बिल चुकाना बाकी नहीं है।',
  'Tell or ask MyCA anything': 'MyCA को कुछ भी बताएँ या पूछें',
  'Send': 'भेजें',
  'This week': 'इस हफ़्ते',
  'Due today': 'आज देय',
  'What happened?': 'क्या हुआ?',
  'I sold something': 'मैंने कुछ बेचा',
  'Raise an invoice for a customer': 'ग्राहक के लिए बिल बनाएँ',
  'Counter sale': 'काउंटर बिक्री',
  'Scan barcodes, bill at the counter and print a receipt': 'बारकोड स्कैन करें, काउंटर पर बिल बनाएँ और रसीद छापें',
  'I bought something': 'मैंने कुछ खरीदा',
  'Add a supplier bill': 'सप्लायर का बिल जोड़ें',
  'Read a bill from a photo': 'फ़ोटो से बिल पढ़ें',
  'A photo, PDF or text of a supplier bill, previewed before it posts': 'सप्लायर के बिल की फ़ोटो, PDF या टेक्स्ट, दर्ज होने से पहले आपको दिखाया जाता है',
  'I paid an expense': 'मैंने खर्च चुकाया',
  'Rent, fuel, anything without a supplier bill': 'किराया, ईंधन, जो भी बिना सप्लायर बिल के हो',
  'Just ask': 'बस पूछें',
  'Type anything, MyCA will sort it': 'कुछ भी लिखें, MyCA सँभाल लेगा',
  'Barcode or item code': 'बारकोड या आइटम कोड',
  'Scan': 'स्कैन करें',
  'Scan or type an item to start the bill.': 'बिल शुरू करने के लिए आइटम स्कैन करें या लिखें।',
  'One less': 'एक कम',
  'One more': 'एक और',
  'Customer name': 'ग्राहक का नाम',
  'Customer (optional)': 'ग्राहक (ज़रूरी नहीं)',
  'Walk-in customer': 'काउंटर ग्राहक',
  'Customer address with state': 'ग्राहक का पता, राज्य के साथ',
  'Needed on bills of ₹50,000 or more': '₹50,000 या उससे ज़्यादा के बिल पर ज़रूरी',
  'Make bill': 'बिल बनाएँ',
  'Post bill': 'बिल दर्ज करें',
  'Print receipt': 'रसीद छापें',
  'Change paper width': 'कागज़ की चौड़ाई बदलें',
  'Choose the receipt printer': 'रसीद प्रिंटर चुनें',
  'Saved once; the next scan fills the bill.': 'एक बार सहेजें; अगली बार स्कैन करते ही बिल में आ जाएगा।',
  'Name': 'नाम',
  'Selling price before GST': 'GST से पहले बिक्री मूल्य',
  'GST %': 'GST दर %',
  'HSN (optional)': 'HSN (ज़रूरी नहीं)',
  'Save and add': 'सहेजें और जोड़ें',
  'Give the item a name.': 'आइटम का नाम लिखें।',
  'Enter the selling price before GST.': 'GST से पहले का बिक्री मूल्य डालें।',
  'Enter the GST rate, for example 5 or 18. Use 0 if there is none.': 'GST दर डालें, जैसे 5 या 18। GST न हो तो 0 लिखें।',
  'A bill of ₹50,000 or more must carry the customer\'s name and address with the state. Add both, then make the bill.': '₹50,000 या उससे ज़्यादा के बिल पर ग्राहक का नाम और राज्य सहित पता होना ज़रूरी है। दोनों जोड़ें, फिर बिल बनाएँ।',
  'Allow Nearby devices for MyCA and pair the receipt printer in Android Bluetooth settings, then print again.': 'MyCA को आस-पास के डिवाइस की अनुमति दें और Android की Bluetooth सेटिंग में रसीद प्रिंटर जोड़ें, फिर दोबारा छापें।',
};
