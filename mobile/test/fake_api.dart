import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart' show isoDate, rupees;

class MemoryOnboardingStore implements OnboardingStore {
  MemoryOnboardingStore({
    this.isWelcomed = false,
    this.isMigrated = false,
    this.isLockEnabled = true,
  });

  bool isWelcomed;
  bool isMigrated;
  bool isLockEnabled;

  @override
  Future<bool> lockEnabled() async => isLockEnabled;

  @override
  Future<void> setLockEnabled(bool enabled) async => isLockEnabled = enabled;

  @override
  Future<bool> welcomed() async => isWelcomed;

  @override
  Future<void> markWelcomed() async => isWelcomed = true;

  @override
  Future<bool> migrated() async => isMigrated;

  @override
  Future<void> markMigrated() async => isMigrated = true;
}

AppState testState(
  FakeMycaApi api, {
  bool onboarded = true,
  PickTextFile? pick,
}) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: onboarded, isMigrated: onboarded),
  pickTextFile: pick ?? (_) async => null,
  now: () => DateTime(2026, 10, 5, 22, 30),
);

class Proposal {
  const Proposal(this.tool, this.args);

  final String tool;
  final Map<String, Object?> args;
}

class QueryCall {
  const QueryCall(this.name, this.args);

  final String name;
  final Map<String, Object?> args;
}

class FakeMycaApi implements MycaApi {
  bool severalRegistrations = false;
  final queryArgs = <QueryCall>[];
  FakeMycaApi({
    this.signedIn = false,
    this.pin = '4321',
    bool emptyBooks = false,
  }) {
    if (emptyBooks) {
      invoices.clear();
      purchases.clear();
      expenses.clear();
      reminders.clear();
    }
  }

  static const token = 'abc123abc123';

  bool signedIn;
  final String pin;
  final sent = <String>[];
  final confirmed = <String>[];
  final queries = <String>[];
  final companyUpdates = <Map<String, String>>[];
  int discards = 0;
  final proposals = <Proposal>[];
  String companyName = 'Nalanda Textiles LLP';
  Proposal? _held;

  final invoices = <Map<String, Object?>>[
    {
      'id': 'INV-0001',
      'date': '2026-08-05',
      'partyName': 'Retail Mart',
      'partyGstin': '27AAACH7409R1Z1',
      'total': 525000,
      'status': 'paid',
      'lines': [
        {'gstRate': 5},
      ],
      'receipts': [
        {'amount': 525000, 'date': '2026-08-20', 'mode': 'bank'},
      ],
    },
    {
      'id': 'INV-0002',
      'date': '2026-08-12',
      'partyName': 'Gujarat Weaves',
      'partyGstin': '24AAACG1234F1Z5',
      'total': 377600,
      'status': 'posted',
      'paymentTermsDays': 30,
      'dueDate': '2026-09-11',
      'lines': [
        {'gstRate': 18},
        {'gstRate': 5},
      ],
      'receipts': <Object?>[],
    },
  ];

  final expenses = <Map<String, Object?>>[
    {
      'id': 'EXP-0001',
      'date': '2026-09-01',
      'head': '5110',
      'headName': 'Rent',
      'description': 'Shop rent',
      'payee': '',
      'amount': 12000,
      'gstRate': 0,
      'inputCredit': false,
      'mode': 'bank',
      'tag': {'source': 'keyword', 'why': '"Shop rent" reads as Rent.'},
    },
    {
      'id': 'EXP-0002',
      'date': '2026-10-02',
      'head': '5100',
      'headName': 'Other expenses',
      'description': 'Diwali gifts',
      'payee': 'Gift Gallery',
      'amount': 5000,
      'gstRate': 0,
      'inputCredit': false,
      'mode': 'cash',
      'tag': {
        'source': 'default',
        'why':
            'Nothing in "Diwali gifts" told me the head, so it is under Other expenses. Tap to change it.',
      },
    },
  ];

  final creditNotes = <Map<String, Object?>>[];
  final reviewAnswers = <String, String>{};
  bool has2b = false;
  bool hasBalance = false;
  final customerTerms = <String, Object?>{'gstin:24AAACG1234F1Z5': 30};
  final recurring = <Map<String, Object?>>[];
  final bankAccounts = <Map<String, Object?>>[
    {'id': '1001', 'label': 'Cash', 'kind': 'cash', 'maskedNumber': '', 'ifsc': '', 'balance': 25000, 'builtIn': true},
    {'id': '1002', 'label': 'Bank', 'kind': 'bank', 'maskedNumber': '', 'ifsc': '', 'balance': 190420, 'builtIn': true},
  ];
  final bankRules = <Map<String, Object?>>[
    {
      'id': 'BR-0001',
      'side': 'out',
      'contains': 'sms charges',
      'pattern': '',
      'minAmount': null,
      'maxAmount': null,
      'then': {'kind': 'charge', 'partyName': '', 'head': '5180', 'otherAccount': '', 'note': ''},
      'hits': 2,
      'createdOn': '2026-09-01',
      'by': 'owner',
    },
  ];
  final bankLines = <Map<String, Object?>>[
    {
      'id': 'BL-000001',
      'account': '1002',
      'date': '2026-10-01',
      'narration': 'NEFT CR GUJARAT WEAVES INV0002',
      'refNo': 'N275261',
      'in': 377600,
      'out': 0,
      'balance': 577600,
      'fingerprint': 'BANK-1111111111111111-1',
      'category': 'unclassified',
      'status': 'unmatched',
      'match': null,
      'importedOn': '2026-10-05',
      'fileLabel': 'hdfc-oct.csv',
      'tieBreak': false,
      'suggestions': [
        {'kind': 'books', 'transferId': '100007', 'docId': 'INV-0002', 'docKind': 'receipt', 'party': 'Gujarat Weaves', 'amount': 377600, 'date': '2026-10-01', 'why': 'Same amount on the same day'},
        {'kind': 'receipt', 'partyName': 'Gujarat Weaves', 'invoiceIds': ['INV-0002'], 'amount': 377600, 'why': 'Gujarat Weaves is in the narration'},
      ],
    },
    {
      'id': 'BL-000002',
      'account': '1002',
      'date': '2026-10-02',
      'narration': 'SMS CHARGES SEP',
      'refNo': '',
      'in': 0,
      'out': 25,
      'balance': 577575,
      'fingerprint': 'BANK-2222222222222222-1',
      'category': 'finance_cost',
      'status': 'unmatched',
      'match': null,
      'importedOn': '2026-10-05',
      'fileLabel': 'hdfc-oct.csv',
      'tieBreak': false,
      'suggestions': [
        {'kind': 'charge', 'head': '5180', 'why': 'Looks like a bank charge'},
      ],
    },
    {
      'id': 'BL-000003',
      'account': '1002',
      'date': '2026-10-03',
      'narration': 'INT PD FOR THE QTR',
      'refNo': '',
      'in': 1200,
      'out': 0,
      'balance': 578775,
      'fingerprint': 'BANK-3333333333333333-1',
      'category': 'interest_income',
      'status': 'unmatched',
      'match': null,
      'importedOn': '2026-10-05',
      'fileLabel': 'hdfc-oct.csv',
      'tieBreak': false,
      'suggestions': [
        {'kind': 'interest', 'why': 'Looks like interest the bank paid you'},
      ],
    },
    {
      'id': 'BL-000004',
      'account': '1002',
      'date': '2026-10-03',
      'narration': 'UPI FABRIC CO BILL 0001',
      'refNo': 'UPI-4411',
      'in': 0,
      'out': 8400,
      'balance': 570375,
      'fingerprint': 'BANK-4444444444444444-1',
      'category': 'purchases',
      'status': 'matched',
      'match': {'kind': 'books', 'id': 'BILL-0001', 'transferIds': ['100009'], 'ruleId': '', 'note': ''},
      'importedOn': '2026-10-05',
      'fileLabel': 'hdfc-oct.csv',
      'tieBreak': false,
      'suggestions': <Object?>[],
    },
    {
      'id': 'BL-000005',
      'account': '1002',
      'date': '2026-06-18',
      'narration': 'SMS CHARGES JUN',
      'refNo': '',
      'in': 0,
      'out': 25,
      'balance': 199975,
      'fingerprint': 'BANK-5555555555555555-1',
      'category': 'finance_cost',
      'status': 'booked',
      'match': {'kind': 'charge', 'id': 'EXP-0005', 'transferIds': ['100005'], 'ruleId': 'BR-0001', 'note': ''},
      'importedOn': '2026-10-05',
      'fileLabel': 'hdfc-jun.csv',
      'tieBreak': false,
      'suggestions': <Object?>[],
    },
  ];
  final bankBooks = <Map<String, Object?>>[
    {'transferId': '100012', 'date': '2026-10-04', 'docKind': 'expense', 'docId': 'EXP-0002', 'party': 'Airtel', 'in': 0, 'out': 1180},
  ];
  final bankTransfers = <Map<String, Object?>>[];
  final quotes = <Map<String, Object?>>[
    {
      'id': 'QT-0001',
      'date': '2026-09-20',
      'partyName': 'Gujarat Weaves',
      'partyGstin': '24AAACG1234F1Z5',
      'total': 59000,
      'validUntil': '2026-10-20',
      'status': 'open',
      'invoiceId': '',
    },
  ];
  final filings = <Map<String, Object?>>[];
  final supplierReminders = <Map<String, Object?>>[];
  final collectionReminders = <Map<String, Object?>>[];
  final paymentRuns = <Map<String, Object?>>[];
  final debitNotes = <Map<String, Object?>>[];
  bool payrollApproved = false;
  bool payrollPaid = false;
  final shares = <Map<String, Object?>>[];
  Map<String, Object?>? transport;
  String buyerAddress = '';
  bool tdsDeductor = false;
  String country = 'IN';
  final salesTaxStates = <Map<String, Object?>>[];
  bool salesTaxPaid = false;
  bool salesTaxFiled = false;
  bool salesTaxApproved = false;
  bool gstPaid = false;
  bool modelOff = false;
  final readDocuments = <String>[];
  final documentMatches = <Map<String, Object?>>[];
  final attachments = <Map<String, Object?>>[];
  final savedReports = <Map<String, Object?>>[
    {'name': 'Sales by customer', 'metric': 'sales', 'groupBy': 'customer', 'period': 'this-month', 'compare': true, 'savedOn': '2026-10-01'},
    {'name': 'Expenses this quarter', 'metric': 'expenses', 'groupBy': 'head', 'period': 'this-quarter', 'compare': false, 'savedOn': '2026-10-02'},
  ];
  final auditEvents = <Map<String, Object?>>[
    {
      'eventId': 'AUD-000001',
      'at': '2026-10-05T10:30:00.000Z',
      'actorId': 'USR-OWNER',
      'actorName': 'Asha',
      'action': 'chat.confirm',
      'kind': 'change',
      'summary': 'Posted Create invoice (INV-0001)',
      'ids': ['INV-0001'],
      'transfers': ['1'],
      'beforeHash': 'a1',
      'afterHash': 'b2',
      'chained': true,
    },
    {
      'eventId': 'AUD-000002',
      'at': '2026-10-05T11:15:00.000Z',
      'actorId': 'USR-OWNER',
      'actorName': 'Asha',
      'action': 'tool.lock_period',
      'kind': 'change',
      'summary': 'Locked the books through 2026-09-30: September closed',
      'ids': <String>[],
      'transfers': <String>[],
      'beforeHash': 'b2',
      'afterHash': 'c3',
      'chained': true,
    },
  ];
  Map<String, Object?> auditChain = {'ok': true, 'chained': 2, 'unchained': 0};
  bool auditLedgerOk = true;
  bool auditMore = false;
  final amendments = <Map<String, Object?>>[];
  bool yearClosed = false;
  bool quarterlyGst = false;
  final sutaRates = <Map<String, Object?>>[];
  num tdsDue = 6000;
  final bankDetails = <Map<String, Object?>>[];
  final tdsDeposits = <Map<String, Object?>>[];
  final tdsCreditRows = <Map<String, Object?>>[
    {'section': '194J', 'tan': 'MUMD12345B', 'deductor': 'Delta Projects', 'customer': 'Delta Projects', 'quarter': 'Q2 2026-27', 'in26as': 2000, 'inBooks': 2000, 'gap': 0, 'status': 'matched'},
    {'section': '194C', 'tan': 'BLRN12345C', 'deductor': 'Northwind Traders', 'customer': '', 'quarter': 'Q2 2026-27', 'in26as': 1500, 'inBooks': 0, 'gap': -1500, 'status': 'not in books'},
    {'section': '194O', 'tan': '', 'deductor': 'amazon', 'customer': '', 'quarter': 'Q3 2026-27', 'in26as': 800, 'inBooks': 920, 'gap': 120, 'status': 'short in 26AS'},
    {'section': '194C', 'tan': '', 'deductor': 'Kappa Retail', 'customer': 'Kappa Retail', 'quarter': 'Q3 2026-27', 'in26as': 0, 'inBooks': 600, 'gap': 600, 'status': 'not in 26AS'},
  ];
  final employees = <Map<String, Object?>>[
    {
      'id': 'EMP-0001',
      'name': 'Ravi Kumar',
      'designation': 'Store manager',
      'joinedOn': '2026-09-01',
      'leftOn': '',
      'monthly': 25000,
      'active': true,
      'pfMember': true,
      'esiMember': false,
      'taxRegime': 'new',
      'salary': [
        {
          'from': '2026-09-01',
          'monthly': 25000,
          'components': [
            {'name': 'Basic', 'amount': 15000},
            {'name': 'HRA', 'amount': 10000},
          ],
        },
      ],
    },
  ];
  final caRequests = <Map<String, Object?>>[
    {
      'id': 'ASK-0001',
      'title': 'Invoice INV-0002 to Gujarat Weaves',
      'facts': [
        'Dated 2026-08-12, buyer GSTIN 24AAACG1234F1Z5',
        'Total ₹3,77,600.00',
      ],
      'status': 'answered',
      'askedBy': 'u-owner',
      'lastOn': '2026-10-04',
      'messages': <Map<String, Object?>>[
        {'by': 'u-owner', 'on': '2026-10-03', 'text': 'Is IGST right here?'},
        {
          'by': 'u-ca',
          'on': '2026-10-04',
          'text': 'Yes, the goods went to Gujarat.',
        },
      ],
      'text':
          'Invoice INV-0002 to Gujarat Weaves\n- Total ₹3,77,600.00\n\n2026-10-03: Is IGST right here?',
    },
  ];
  final reminders = <Map<String, Object?>>[
    {
      'id': 'REM-0001',
      'text': 'Call Rajesh about the order',
      'due': '2026-10-05',
      'inDays': 0,
      'state': 'today',
      'about': null,
    },
    {
      'id': 'REM-0002',
      'text': 'Pay rent',
      'due': '2026-10-09',
      'inDays': 4,
      'state': 'later',
      'about': null,
    },
    {
      'id': 'REM-0003',
      'text': 'Bill from Ganga Mills (GM/221) arrived through Scanner: bill-78.jpg. Open it to check the lines and post it.',
      'due': '2026-10-09',
      'inDays': 4,
      'state': 'later',
      'about': {'kind': 'document', 'id': 'a' * 64, 'name': 'bill-78.jpg'},
      'documentSha256': 'a' * 64,
      'documentName': 'bill-78.jpg',
    },
  ];
  String reviewHash = 'a' * 64;

  Map<String, Object?> reviewData() {
    const order = ['sales', 'credit', 'approve'];
    final steps = <Map<String, Object?>>[];
    String? next;
    for (final id in order) {
      final answer = reviewAnswers[id];
      final status = answer == null
          ? 'open'
          : (answer == 'wrong' ? 'wrong' : 'confirmed');
      final waiting = order
          .takeWhile((before) => before != id)
          .where(
            (before) =>
                reviewAnswers[before] == null ||
                reviewAnswers[before] == 'wrong',
          )
          .firstOrNull;
      if (next == null && status != 'confirmed') next = id;
      steps.add({
        'id': id,
        'title': {
          'sales': 'Sales in October 2026',
          'credit': 'Purchases and input credit in October 2026',
          'approve': 'Approve the October 2026 return',
        }[id],
        'lines': id == 'sales'
            ? [
                {'label': '1 sale, value before tax', 'amount': 20000},
                {'label': 'Tax on sales', 'amount': 3600, 'strong': true},
              ]
            : id == 'credit'
            ? [
                {'label': '0 purchase bills'},
                {'label': 'Input credit', 'amount': 0, 'strong': true},
              ]
            : [
                {'label': 'Tax on sales', 'amount': 3600},
                {'label': 'Input credit', 'amount': 0},
              ],
        'note': id == 'approve'
            ? 'MyCA does not work out the amount to pay yet.'
            : 'From the documents of this month.',
        'question': id == 'approve'
            ? 'Approve these figures for the return?'
            : 'Is this information correct?',
        'yes': id == 'approve' ? 'Approve' : 'Yes, correct',
        'no': id == 'approve' ? 'Not yet' : 'Something is wrong',
        'status': status,
        'waitingFor': waiting,
        'answer': answer == null
            ? null
            : {
                'answer': answer,
                'note': answer == 'wrong' ? 'Rate looks wrong' : '',
              },
      });
    }
    return {
      'period': '2026-10',
      'month': 'October 2026',
      'draftHash': reviewHash,
      'empty': false,
      'changed': false,
      'steps': steps,
      'next': next,
      'approved': reviewAnswers['approve'] == 'approve',
      'approval': reviewAnswers['approve'] == 'approve'
          ? {'on': '2026-10-05'}
          : null,
    };
  }

  final imsDecisions = <String, Map<String, Object?>>{};
  int imsOrphaned = 0;
  final imsRows = <Map<String, Object?>>[
    {
      'key': '2026-10|27AAACB2222B1Z5|BM12|B2B',
      'section': 'B2B',
      'supplierGstin': '27AAACB2222B1Z5',
      'supplierName': 'BOX MART',
      'invoiceNo': 'BM-12',
      'invoiceDate': '2026-10-16',
      'taxableValue': 6000,
      'cgst': 0,
      'sgst': 0,
      'igst': 300,
      'cess': 0,
      'totalValue': 6300,
      'credit': 300,
      'itcAvailability': 'Y',
      'billId': 'BILL-0003',
      'match': 'amount differs',
      'why': 'The amounts differ: taxable value 5000 in your books, 6000 in 2B; IGST 250 in your books, 300 in 2B.',
      'suggested': 'pending',
      'decision': '',
      'note': '',
      'decidedBy': '',
      'decidedOn': '',
      'lines': 1,
    },
    {
      'key': '2026-10|24AAACF7856R1ZY|GM77|B2B',
      'section': 'B2B',
      'supplierGstin': '24AAACF7856R1ZY',
      'supplierName': 'GUJARAT MILLS',
      'invoiceNo': 'GM/77',
      'invoiceDate': '2026-10-08',
      'taxableValue': 20000,
      'cgst': 0,
      'sgst': 0,
      'igst': 3600,
      'cess': 0,
      'totalValue': 23600,
      'credit': 3600,
      'itcAvailability': 'N',
      'billId': 'BILL-0002',
      'match': 'matched',
      'why': 'Matches BILL-0002 in your books.',
      'suggested': 'accept',
      'decision': '',
      'note': '',
      'decidedBy': '',
      'decidedOn': '',
      'lines': 1,
    },
    {
      'key': '2026-10|27AAACH7409R1Z1|RS1|B2B',
      'section': 'B2B',
      'supplierGstin': '27AAACH7409R1Z1',
      'supplierName': 'RETAIL SUPPLY',
      'invoiceNo': 'RS-1',
      'invoiceDate': '2026-10-15',
      'taxableValue': 1000,
      'cgst': 0,
      'sgst': 0,
      'igst': 180,
      'cess': 0,
      'totalValue': 1180,
      'credit': 180,
      'itcAvailability': 'Y',
      'billId': '',
      'match': 'not in books',
      'why': 'No purchase bill with this number from this supplier.',
      'suggested': 'pending',
      'decision': '',
      'note': '',
      'decidedBy': '',
      'decidedOn': '',
      'lines': 1,
    },
  ];

  List<Map<String, Object?>> _imsPicked(Map<String, Object?> args) {
    final keys = (args['keys'] as List?)?.cast<String>() ?? const <String>[];
    if (keys.isNotEmpty) return imsRows.where((r) => keys.contains(r['key'])).toList();
    return switch (args['select']) {
      'matched' => imsRows.where((r) => r['match'] == 'matched' || r['match'] == 'date differs').toList(),
      'suggested' => imsRows.where((r) => r['suggested'] == args['decision']).toList(),
      'undecided' => imsRows.where((r) => r['decision'] == '').toList(),
      'all' => List.of(imsRows),
      _ => const <Map<String, Object?>>[],
    };
  }

  static const _imsWords = {'accept': 'accepted', 'reject': 'rejected', 'pending': 'pending', 'clear': 'not decided'};

  final purchases = <Map<String, Object?>>[
    {
      'id': 'BILL-0001',
      'date': '2026-08-06',
      'partyName': 'Fabric Co',
      'partyGstin': '27AABCT1332L1ZE',
      'total': 42000,
      'status': 'posted',
    },
  ];

  final supplierTermsSet = <Map<String, Object?>>[];

  final supplierDues = <String, Object?>{
    'asOf': '2026-10-05',
    'bills': [
      {'billId': 'BILL-0001', 'supplier': 'Fabric Co', 'gstin': '27AABCT1332L1ZE', 'date': '2026-08-06', 'total': 42000, 'outstanding': 42000, 'payBy': '2026-08-21', 'daysLeft': -45, 'overdue': true, 'msme': true},
      {'billId': 'BILL-0002', 'supplier': 'Micro Dyes', 'gstin': '24AAACM1234D1Z2', 'date': '2026-10-01', 'total': 11800, 'outstanding': 11800, 'payBy': '2026-10-16', 'daysLeft': 11, 'overdue': false, 'msme': true},
    ],
    'msme': {'count': 2, 'outstanding': 53800, 'overdue': 1, 'overdueOutstanding': 42000, 'rule': 'IT-2025 s.Deductions allowed only on actual payment (successor to s.43B(h))'},
    'note': 'A bill to a micro or small enterprise paid after its MSMED time limit is not deductible this year; it is deducted in the year it is paid. The limit is counted from the day the goods or services were accepted.',
  };

  static const _user = {
    'userId': 'USR-ADMIN',
    'name': 'Firm Admin',
    'role': 'admin',
    'locked': false,
  };

  @override
  Future<Snapshot> snapshot() async => Snapshot.fromJson({
    'company': {'name': companyName, 'gstin': country == 'US' ? '' : '27AABCU9603R1ZN', 'tdsDeductor': tdsDeductor, 'country': country, 'gstFrequency': quarterlyGst ? 'quarterly' : 'monthly'},
    'invoices': invoices,
    'purchases': purchases,
    'expenses': expenses,
    'creditNotes': creditNotes,
    'customerTerms': customerTerms,
    'quotes': quotes,
    'users': [_user],
    'activeUser': signedIn ? _user : null,
  });

  @override
  Future<SignInResult> signIn(String userId, String pin) async {
    if (pin != this.pin) {
      return const SignInResult(ok: false, error: 'INVALID_PIN');
    }
    signedIn = true;
    return const SignInResult(ok: true, error: '');
  }

  @override
  Future<void> signOut() async {
    signedIn = false;
  }

  ChatReply _preview(
    String summary, [
    Map<String, Object?> figures = const {},
  ]) => ChatReply.fromJson({
    'reply': summary,
    'posted': false,
    'awaitingConfirmation': true,
    'preview': {
      'token': token,
      'summary': summary,
      'effects': ['The books change only after you confirm.'],
      'figures': figures,
    },
  });

  final uploads = <String, String>{};
  final periodsAsked = <String?>[];

  @override
  Future<String> upload(String name, String content) async {
    final hash = 'sha-of-$name';
    uploads[hash] = content;
    return hash;
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    final proposal = Proposal(name, args);
    proposals.add(proposal);
    if (name == 'create_invoice' && args['partyName'] == 'Blocked Party') {
      return ChatReply.fromJson({
        'reply': 'I did not post anything, because:\n· GST rate is not valid.',
        'posted': false,
        'blocked': true,
      });
    }
    _held = proposal;
    if (name == 'post_expense') {
      final chosen = args['head'] as String?;
      final headName = chosen == '5200'
          ? 'Advertising and marketing'
          : (chosen == '5110' ? 'Rent' : 'Other expenses');
      final head = chosen ?? '5100';
      return _preview(
        '$headName: ${args['narration']} ₹${args['amount']} paid from ${args['mode'] ?? 'bank'}.',
        {
          'head': head,
          'headName': headName,
          'tagSource': chosen == null ? 'default' : 'chosen',
        },
      );
    }
    if (name == 'create_quote') {
      final kind = (args['kind'] as String?) ?? 'quote';
      if (kind != 'quote') {
        return _preview('${salesDocumentLabel(kind)} to ${args['partyName']}: total ₹59,000.00.');
      }
      return _preview(
        'Quote to ${args['partyName']}: total ₹59,000.00. Valid until 2026-11-04.',
      );
    }
    if (name == 'add_recurring') {
      return _preview('Repeats ${args['every']} from ${args['startDate']}.');
    }
    if (name == 'stop_recurring') {
      return _preview('Stop ${args['id']}.');
    }
    if (name == 'mark_quote') {
      return _preview('${args['id']}: ${args['outcome']}.');
    }
    if (name == 'convert_quote') {
      return _preview(
        'From quote ${args['id']}: Invoice to Gujarat Weaves, total ₹59,000.00.',
      );
    }
    if (name == 'set_tds_deductor') {
      return _preview('This business deducts TDS, TAN ${args['tan']}.');
    }
    if (name == 'record_tds_deposit') {
      return _preview('TDS deposit of ₹6,000.00 on ${args['date']}, challan ${args['challan']}, from the bank.');
    }
    if (name == 'add_employee') {
      return _preview('Add ${args['name']}, joined ${args['joinedOn']}, at ₹21,000.00 a month.');
    }
    if (name == 'change_salary') {
      return _preview('Ravi Kumar: ₹30,000.00 a month from ${args['effectiveFrom']}, was ₹25,000.00.');
    }
    if (name == 'end_employment') {
      return _preview('Ravi Kumar left; last day ${args['leftOn']}.');
    }
    if (name == 'set_employee_bank') {
      return _preview('Ravi Kumar is paid into account ending ${'${args['bankAccount']}'.substring('${args['bankAccount']}'.length - 4)} at ${args['ifsc']}.');
    }
    if (name == 'save_report') {
      return _preview('Save the report ${args['name']}: ${args['metric']} by ${args['groupBy']} for ${args['period']}${args['compare'] == true ? ', compared with the period before' : ''}.');
    }
    if (name == 'delete_report') {
      return _preview('Delete the saved report ${args['name']}.');
    }
    if (name == 'attach_document') {
      return _preview('Attach the document to ${args['id']}. Nothing else changes.');
    }
    if (name == 'record_payment_run') {
      final ids = (args['billIds'] as List).cast<String>();
      final two = ids.length == 2;
      return _preview('Pay ₹${two ? '14,700.00' : '8,400.00'} to ${two ? '2 suppliers' : 'Big Mills'} across ${two ? '2 bills' : '1 bill'} from the bank on 2026-10-05. Bank and cash ₹2,00,000.00 before, ₹${two ? '1,85,300.00' : '1,91,600.00'} after. Payroll and GST still clear.');
    }
    if (name == 'record_collection_reminder') {
      return _preview('Send a neutral payment reminder to ${args['customer']} for ₹5,900.00 across 1 invoice (oldest 40 days late). ${args['customer']} has not paid enough invoices yet to judge.');
    }
    if (name == 'record_supplier_reminder') {
      return _preview('Send a reminder to Gujarat Mills about 1 bill for ${args['period']}, with ₹3,600.00 of your input credit waiting on them.');
    }
    if (name == 'record_filing') {
      return _preview('Record GSTR-1 (monthly) for ${args['period']} as filed on ${args['filedOn']}, ARN ${args['arn']}. It was due on 2026-09-11. That is after the due date.');
    }
    if (name == 'ask_ca') {
      final docs = args['documents'] as List? ?? const [];
      return _preview(
        'Ask your CA about ${(args['subject'] as Map)['id'] ?? (args['subject'] as Map)['period']}: "${args['note']}"${docs.isEmpty ? '' : ' with ${docs.length} file(s) attached'}',
      );
    }
    if (name == 'reply_ca' || name == 'close_ca') {
      return _preview('$name ${args['id']}');
    }
    if (name == 'set_payment_terms') {
      return _preview('${args['partyName']}: Net ${args['days']}.');
    }
    if (name == 'set_supplier_terms') {
      final days = args['days'];
      return _preview(
        args['msme'] == true
            ? 'Mark ${args['partyName']} as an MSME supplier (${args['category'] ?? 'category not given'}, Udyam ${args['udyam'] ?? 'not given'}) to be paid within ${days ?? 15} days'
            : "Set ${args['partyName']}'s terms to $days days",
        {'days': days ?? 15},
      );
    }
    if (name == 'set_cash_balance') {
      return _preview(
        'On 2026-10-05: bank ₹${args['bank']}, cash in hand ₹${args['cash'] ?? 0}.',
      );
    }
    if (name == 'add_reminder') {
      return _preview('Remind you on ${args['due']}: ${args['text']}.');
    }
    if (name == 'complete_reminder') {
      return _preview('Mark done: ${args['id']}.');
    }
    if (name == 'import_gstr2b') {
      return _preview(
        'GSTR-2B for ${args['period']}: 4 entries from 4 suppliers.',
      );
    }
    if (name == 'ims_decide') {
      final picked = _imsPicked(args);
      final credit = picked.fold<num>(0, (sum, r) => sum + (r['credit'] as num));
      final word = _imsWords[args['decision']];
      return _preview(
        picked.length == 1
            ? 'Mark ${picked.single['supplierName']} ${picked.single['invoiceNo']} as $word in IMS for ${args['period']}.'
            : 'Mark ${picked.length} invoices in IMS for ${args['period']} as $word (credit ₹$credit).',
        {'count': picked.length, 'credit': credit},
      );
    }
    if (name == 'gst_review_answer') {
      if (args['draftHash'] != reviewHash) {
        _held = null;
        return ChatReply.fromJson({
          'reply':
              'I did not post anything, because:\n· Your books for this month changed after you saw these figures.',
          'posted': false,
          'blocked': true,
        });
      }
      return _preview('Review step ${args['step']}: ${args['answer']}.');
    }
    if (name == 'create_credit_note') {
      final amount = args['amount'];
      return _preview(
        'Credit note of ₹${amount ?? '3,77,600.00'} against ${args['invoiceId']} (Gujarat Weaves) dated ${args['date']}. Reason: ${args['reason']}.',
        {'invoiceId': args['invoiceId'], 'total': amount ?? 377600},
      );
    }
    if (name == 'approve_payroll') {
      return _preview(
        'Payroll for October 2026: 1 employee, gross ₹30,000.00, deductions ₹2,000.00, net to pay ₹28,000.00.',
        {'period': args['period'], 'net': 28000},
      );
    }
    if (name == 'record_salary_payment') {
      return _preview('Salaries for October 2026: ₹28,000.00 paid from the bank on ${args['date']}.', {'period': args['period']});
    }
    if (name == 'set_transport') {
      return _preview(
        'Transport for ${args['invoiceId']} (Gujarat Weaves): ${args['distanceKm']} km by road, vehicle ${args['vehicleNo']}.',
        {'invoiceId': args['invoiceId'], 'distanceKm': args['distanceKm'], 'vehicleNo': args['vehicleNo']},
      );
    }
    if (name == 'create_debit_note') {
      return _preview(
        'Debit note of ₹${args['amount']} against ${args['invoiceId']} (Gujarat Weaves) dated ${args['date']}. Reason: ${args['reason']}.',
        {'invoiceId': args['invoiceId'], 'total': args['amount']},
      );
    }
    if (name == 'cancel_invoice') {
      return _preview(
        'Cancel ${args['invoiceId']} (Gujarat Weaves) by a credit note for its full ₹3,77,600.00 dated ${args['date']}.',
        {'invoiceId': args['invoiceId'], 'cancels': true},
      );
    }
    if (name == 'set_expense_head') {
      return _preview(
        'Move ${args['id']} to ${args['head'] == '5200' ? 'Advertising and marketing' : args['head']}.',
        {'head': args['head'], 'headName': 'Advertising and marketing'},
      );
    }
    if (name == 'match_bank_line') {
      final line = bankLines.where((l) => l['id'] == args['lineId']).firstOrNull;
      final amount = line == null ? 0 : ((line['in'] as num) > 0 ? line['in'] as num : line['out'] as num);
      final who = args['partyName'] ?? args['invoiceId'] ?? args['billId'] ?? args['transferId'] ?? args['head'] ?? args['otherAccount'];
      return _preview('${args['lineId']}: ${args['kind']} of ₹$amount${who == null ? '' : ' ($who)'}${args['remember'] == true ? ', and a rule for next time' : ''}.');
    }
    if (name == 'unmatch_bank_line') return _preview('Unlink ${args['lineId']}. Nothing is posted or reversed.');
    if (name == 'book_bank_charges') {
      final open = bankLines.where((l) => l['status'] == 'unmatched' && (l['category'] == 'finance_cost' || l['category'] == 'interest_income')).length;
      return _preview('Book $open ${open == 1 ? 'line' : 'lines'} as bank charges and interest.');
    }
    if (name == 'add_bank_rule') return _preview('Rule: ${args['side']} lines containing “${args['contains']}” are booked as ${args['kind']}.');
    if (name == 'remove_bank_rule') return _preview('Remove the rule ${args['id']}.');
    if (name == 'run_bank_rules') return _preview('Run your bank rules over the lines not matched yet.');
    if (name == 'set_bank_account') return _preview('Add the account ${args['label']} (${args['kind']}).');
    if (name == 'record_transfer') {
      return _preview('Transfer ₹${args['amount']} from ${args['fromAccount']} to ${args['toAccount']} on ${args['date']}. Recorded once, between your own accounts.');
    }
    if (name == 'record_tds_withheld') {
      final invoice = invoices.where((i) => i['id'] == args['invoiceId']).firstOrNull;
      final amount = args['amount'] as num;
      return _preview(
        'TDS of ${rupees(amount)} withheld by ${invoice?['partyName'] ?? 'the customer'} on ${args['invoiceId']} (section ${args['section']})',
        {'amount': amount, 'remaining': invoice == null ? 0 : (invoice['total'] as num) - _receivedOn(invoice) - amount},
      );
    }
    if (name == 'import_bank' && args['post'] == 'hold') return _preview('Bank statement: the lines are read and wait for you to match them.');
    return _preview(switch (name) {
      'create_invoice' => 'Invoice to ${args['partyName']}: total ₹9,440.00.',
      'record_receipt' => 'Receipt of ₹1,000.00 against ${args['invoiceId']}.',
      'record_payment' =>
        'Pay Fabric Co ₹${args['amount']} against ${args['billId']} from the ${args['mode']}.',
      'create_purchase_note' => 'Debit note of ₹${args['amount']} against ${args['billId']}: ${args['reason']}. You owe Fabric Co that much less.',
      'govt_generate_irn' => 'Generate the IRN for ${args['invoiceId']} through the action gate.',
      'import_tally' => 'Tally import: 12 vouchers ready, 1 skipped.',
      _ => 'Run $name.',
    });
  }

  @override
  Future<ChatReply> confirm(String token) async {
    confirmed.add(token);
    final held = _held;
    if (token == FakeMycaApi.token && held != null) {
      _held = null;
      if (held.tool == 'record_payment') {
        final bill = purchases.firstWhere((b) => b['id'] == held.args['billId']);
        final paid = <Object?>[
          ...(bill['payments'] as List<Object?>? ?? const <Object?>[]),
          {
            'amount': held.args['amount'],
            'date': held.args['date'],
            'mode': held.args['mode'],
          },
        ];
        final total = paid.fold<num>(
          0,
          (sum, p) => sum + ((p as Map)['amount'] as num),
        );
        bill['payments'] = paid;
        bill['status'] = total >= (bill['total'] as num) ? 'paid' : 'partial';
        return ChatReply.fromJson({
          'reply': 'Paid Fabric Co against ${held.args['billId']}.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'post_expense') {
        expenses.add({
          'id': 'EXP-0003',
          'date': '2026-10-05',
          'head': held.args['head'] ?? '5100',
          'headName': held.args['head'] == '5200'
              ? 'Advertising and marketing'
              : 'Other expenses',
          'description': held.args['narration'],
          'payee': held.args['payee'] ?? '',
          'amount': held.args['amount'],
          'gstRate': held.args['gstRate'] ?? 0,
          'inputCredit': false,
          'mode': held.args['mode'] ?? 'bank',
          'tag': {
            'source': held.args['head'] == null ? 'default' : 'chosen',
            'why': 'x',
          },
        });
        return ChatReply.fromJson({
          'reply': 'Posted EXP-0003.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'add_recurring') {
        recurring.add({
          'id': 'RP-${(recurring.length + 1).toString().padLeft(4, '0')}',
          'kind': held.args['kind'],
          'every': held.args['every'],
          'party': held.args['partyName'] ?? held.args['payee'] ?? held.args['narration'] ?? '',
          'amount': held.args['amount'] ?? 29500,
          'startDate': held.args['startDate'],
          'endDate': '',
          'nextDate': held.args['startDate'],
          'status': 'active',
          'count': 0,
          'lastError': '',
          'last': null,
        });
        return ChatReply.fromJson({'reply': 'Set up.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'stop_recurring') {
        recurring.firstWhere((r) => r['id'] == held.args['id'])['status'] = 'stopped';
        return ChatReply.fromJson({'reply': 'Stopped.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'create_quote' && (held.args['kind'] ?? 'quote') != 'quote') {
        final kind = held.args['kind'] as String;
        final prefix = {'proforma': 'PI', 'order': 'SO', 'challan': 'DC'}[kind];
        quotes.add({
          'id': '$prefix-0001',
          'kind': kind,
          'reason': held.args['reason'] ?? '',
          'date': '2026-10-05',
          'partyName': held.args['partyName'],
          'partyGstin': held.args['partyGstin'] ?? '',
          'total': 59000,
          'validUntil': '2026-11-04',
          'status': 'open',
          'invoiceId': '',
        });
        return ChatReply.fromJson({'reply': '${salesDocumentLabel(kind)} $prefix-0001 made.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'create_quote') {
        quotes.add({
          'id': 'QT-0002',
          'date': '2026-10-05',
          'partyName': held.args['partyName'],
          'partyGstin': held.args['partyGstin'] ?? '',
          'total': 59000,
          'validUntil': '2026-11-04',
          'status': 'open',
          'invoiceId': '',
        });
        return ChatReply.fromJson({
          'reply': 'Quote QT-0002 made.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'mark_quote') {
        quotes.firstWhere((q) => q['id'] == held.args['id'])['status'] =
            held.args['outcome'];
        return ChatReply.fromJson({
          'reply': 'Marked.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'convert_quote') {
        final quote = quotes.firstWhere((q) => q['id'] == held.args['id']);
        quote['status'] = 'invoiced';
        quote['invoiceId'] = 'INV-0003';
        return ChatReply.fromJson({
          'reply': 'Posted INV-0003 from quote ${held.args['id']}.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'set_tds_deductor') {
        tdsDeductor = true;
        return ChatReply.fromJson({'reply': 'Done. This business deducts TDS under TAN ${held.args['tan']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'record_tds_deposit') {
        tdsDeposits.add(held.args);
        tdsDue = 0;
        return ChatReply.fromJson({'reply': 'Recorded the TDS deposit. Nothing is left to deposit.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'add_employee') {
        final parts = (held.args['components'] as List).cast<Map<String, Object?>>();
        final monthly = parts.fold<num>(0, (sum, p) => sum + (p['amount'] as num));
        employees.add({
          'id': 'EMP-0002',
          'name': held.args['name'],
          'designation': held.args['designation'] ?? '',
          'joinedOn': held.args['joinedOn'],
          'leftOn': '',
          'monthly': monthly,
          'active': true,
          'pfMember': held.args['pfMember'] == true,
          'esiMember': held.args['esiMember'] == true,
          'taxRegime': '',
          'salary': [
            {'from': held.args['joinedOn'], 'monthly': monthly, 'components': parts},
          ],
        });
        return ChatReply.fromJson({'reply': 'Added ${held.args['name']} as EMP-0002. No payroll has been run.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'set_employee_bank') {
        bankDetails.add(held.args);
        return ChatReply.fromJson({'reply': 'Recorded the bank account.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'end_employment') {
        final e = employees.firstWhere((e) => e['id'] == held.args['id']);
        e['leftOn'] = held.args['leftOn'];
        e['active'] = false;
        return ChatReply.fromJson({'reply': 'Recorded that ${e['name']} left on ${held.args['leftOn']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'save_report') {
        savedReports.removeWhere((r) => r['name'] == held.args['name']);
        savedReports.add({...held.args, 'savedOn': '2026-10-05'});
        return ChatReply.fromJson({'reply': 'Saved the report ${held.args['name']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'delete_report') {
        savedReports.removeWhere((r) => r['name'] == held.args['name']);
        return ChatReply.fromJson({'reply': 'Deleted the report ${held.args['name']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'attach_document') {
        attachments.add(held.args);
        return ChatReply.fromJson({'reply': 'Attached the document to ${held.args['id']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'record_payment_run') {
        paymentRuns.add(held.args);
        return ChatReply.fromJson({'reply': 'Paid the chosen bills from the bank on 2026-10-05.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'record_collection_reminder') {
        collectionReminders.add(held.args);
        return ChatReply.fromJson({'reply': 'Recorded the neutral reminder to ${held.args['customer']} for ₹5,900.00 on 2026-10-05. Send it from your phone now; I will remind you to check for the payment in a week.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'record_supplier_reminder') {
        supplierReminders.add(held.args);
        return ChatReply.fromJson({'reply': 'Reminder SRM-0001 to Gujarat Mills for ${held.args['period']} is ready to send from your phone. Nothing has gone from MyCA.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'record_filing') {
        filings.insert(0, {
          'returnType': held.args['returnType'],
          'label': 'GSTR-1 (monthly)',
          'period': held.args['period'],
          'arn': held.args['arn'],
          'filedOn': held.args['filedOn'],
          'late': true,
        });
        return ChatReply.fromJson({'reply': 'Recorded GSTR-1 (monthly) for ${held.args['period']} as filed. MyCA did not file anything.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'ask_ca') {
        caRequests.add({
          'id': 'ASK-0002',
          'title':
              'About ${(held.args['subject'] as Map)['id'] ?? (held.args['subject'] as Map)['period']}',
          'facts': const <Object?>[],
          'status': 'open',
          'askedBy': 'u-owner',
          'lastOn': '2026-10-05',
          'messages': <Map<String, Object?>>[
            {'by': 'u-owner', 'on': '2026-10-05', 'text': held.args['note']},
          ],
          if (held.args['documents'] != null) 'attachments': held.args['documents'],
          'text': '',
        });
        return ChatReply.fromJson({
          'reply': 'Sent to your CA in MyCA (ASK-0002).',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'reply_ca') {
        final request = caRequests.firstWhere(
          (r) => r['id'] == held.args['id'],
        );
        (request['messages'] as List).add({
          'by': 'u-owner',
          'on': '2026-10-05',
          'text': held.args['text'],
        });
        request['status'] = 'open';
        return ChatReply.fromJson({
          'reply': 'Replied.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'close_ca') {
        caRequests.firstWhere((r) => r['id'] == held.args['id'])['status'] =
            'closed';
        return ChatReply.fromJson({
          'reply': 'Closed.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'set_payment_terms') {
        final gstin = held.args['partyGstin'] as String?;
        customerTerms[gstin == null
                ? 'name:${(held.args['partyName'] as String).toLowerCase()}'
                : 'gstin:$gstin'] =
            held.args['days'];
        return ChatReply.fromJson({
          'reply': 'Noted.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'set_supplier_terms') {
        supplierTermsSet.add(held.args);
        return ChatReply.fromJson({
          'reply': '${held.args['partyName']} is recorded as an MSME. New bills from them carry the pay-by date from the MSMED Act; old bills keep theirs.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'set_cash_balance') {
        hasBalance = true;
        return ChatReply.fromJson({
          'reply': 'Noted.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'add_reminder') {
        reminders.add({
          'id': 'REM-0003',
          'text': held.args['text'],
          'due': held.args['due'],
          'inDays': 1,
          'state': 'later',
          'about': held.args['invoiceId'] == null
              ? null
              : {
                  'kind': 'invoice',
                  'id': held.args['invoiceId'],
                  'name': 'Gujarat Weaves',
                },
        });
        return ChatReply.fromJson({
          'reply': 'Set. On ${held.args['due']}: ${held.args['text']}.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'complete_reminder') {
        reminders.removeWhere((r) => r['id'] == held.args['id']);
        return ChatReply.fromJson({
          'reply': 'Done.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'import_gstr2b') {
        has2b = true;
        return ChatReply.fromJson({
          'reply': 'Added.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'ims_decide') {
        final picked = _imsPicked(held.args);
        final decision = held.args['decision'] as String;
        final note = decision == 'clear' ? '' : '${held.args['note'] ?? ''}';
        for (final row in picked) {
          row['decision'] = decision == 'clear' ? '' : decision;
          row['note'] = note;
          if (decision == 'clear') {
            imsDecisions.remove(row['key']);
          } else {
            imsDecisions['${row['key']}'] = {'decision': decision, 'note': note, 'by': 'USR-ADMIN', 'on': '2026-10-05'};
          }
        }
        return ChatReply.fromJson({
          'reply': 'Marked ${picked.length} ${picked.length == 1 ? 'row' : 'rows'} ${_imsWords[decision]} in IMS for ${held.args['period']}.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'gst_review_answer') {
        reviewAnswers[held.args['step'] as String] =
            held.args['answer'] as String;
        final approved = held.args['answer'] == 'approve';
        return ChatReply.fromJson({
          'reply': approved
              ? 'Approved the October 2026 figures. Nothing has been filed.'
              : 'Confirmed.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'approve_payroll') {
        payrollApproved = true;
        return ChatReply.fromJson({'reply': 'Approved payroll for October 2026.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'record_salary_payment') {
        payrollPaid = true;
        return ChatReply.fromJson({'reply': 'Recorded salaries paid.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'set_transport') {
        transport = {'distanceKm': held.args['distanceKm'], 'vehicleNo': held.args['vehicleNo']};
        return ChatReply.fromJson({
          'reply': 'Recorded transport for ${held.args['invoiceId']}.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'create_debit_note') {
        debitNotes.add({
          'id': 'DN-0001',
          'date': held.args['date'],
          'invoiceId': held.args['invoiceId'],
          'partyName': 'Gujarat Weaves',
          'reason': held.args['reason'],
          'total': held.args['amount'],
        });
        return ChatReply.fromJson({
          'reply': 'Debit note DN-0001 for ₹${held.args['amount']} against ${held.args['invoiceId']}.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'create_credit_note' || held.tool == 'cancel_invoice') {
        final cancels = held.tool == 'cancel_invoice';
        creditNotes.add({
          'id': 'CN-0001',
          'date': held.args['date'],
          'invoiceId': held.args['invoiceId'],
          'partyName': 'Gujarat Weaves',
          'reason': held.args['reason'] ?? 'Invoice cancelled',
          'total': cancels ? 377600 : held.args['amount'],
          'cancels': cancels,
        });
        if (cancels) {
          invoices.firstWhere(
            (i) => i['id'] == held.args['invoiceId'],
          )['status'] = 'cancelled';
        }
        return ChatReply.fromJson({
          'reply': cancels
              ? 'Cancelled ${held.args['invoiceId']}.'
              : 'Posted CN-0001.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'set_expense_head') {
        final moved = expenses.firstWhere((e) => e['id'] == held.args['id']);
        moved['head'] = held.args['head'];
        moved['headName'] = 'Advertising and marketing';
        return ChatReply.fromJson({
          'reply': 'Moved ${held.args['id']}.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'amend_invoice') {
        amendments.add({'id': 'AMD-0001', 'invoiceId': held.args['invoiceId'], 'reason': held.args['reason']});
        return ChatReply.fromJson({'reply': '${held.args['invoiceId']} amended (AMD-0001) for ${held.args['reason']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'create_purchase' && held.args['supplierInvoiceNo'] == 'GM/221') {
        return ChatReply.fromJson({'reply': 'Posted PUR-0002 from Ganga Mills for ₹12,600.00.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'set_suta_rate') {
        sutaRates.add({'state': held.args['state'], 'ratePercent': held.args['ratePercent'], 'wageBase': held.args['wageBase'], 'from': '2026-01-01'});
        return ChatReply.fromJson({'reply': 'Recorded state unemployment for ${held.args['state']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'close_year') {
        yearClosed = true;
        return ChatReply.fromJson({'reply': 'Closed ${held.args['year']}: profit ₹80,000.00 moved to capital.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'record_gst_payment') {
        gstPaid = true;
        return ChatReply.fromJson({'reply': 'Recorded the GST payment for ${held.args['period']}: ₹3,600.00 in cash.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'set_sales_tax_nexus') {
        salesTaxStates.removeWhere((row) => row['state'] == held.args['state']);
        salesTaxStates.add({'state': held.args['state'], 'frequency': held.args['frequency']});
        return ChatReply.fromJson({'reply': 'Recorded: you collect sales tax in ${held.args['state']} and file ${held.args['frequency']}.', 'posted': true});
      }
      if (held.tool == 'record_sales_tax_payment') {
        salesTaxPaid = true;
        return ChatReply.fromJson({'reply': 'Recorded \$53.75 of sales tax paid to ${held.args['state']} for ${held.args['period']}.', 'posted': true});
      }
      if (held.tool == 'record_sales_tax_filing') {
        salesTaxFiled = true;
        return ChatReply.fromJson({'reply': 'Recorded the sales tax return ${held.args['state']} for ${held.args['period']} as filed, confirmation ${held.args['confirmation']}.', 'posted': true});
      }
      if (held.tool == 'sales_tax_review_answer') {
        salesTaxApproved = true;
        return ChatReply.fromJson({'reply': 'Confirmed.', 'posted': true});
      }
      if (held.tool == 'record_tds_withheld') {
        final invoice = invoices.firstWhere((i) => i['id'] == held.args['invoiceId']);
        final amount = held.args['amount'] as num;
        invoice['receipts'] = <Object?>[
          ...(invoice['receipts'] as List<Object?>? ?? const <Object?>[]),
          {
            'amount': amount,
            'date': held.args['date'],
            'mode': 'tds',
            'section': held.args['section'],
            if (held.args['tan'] != null) 'tan': held.args['tan'],
          },
        ];
        final left = (invoice['total'] as num) - _receivedOn(invoice);
        invoice['status'] = left <= 0.01 ? 'paid' : 'partial';
        return ChatReply.fromJson({
          'reply': 'Recorded TDS of ${rupees(amount)} withheld on ${held.args['invoiceId']}; ${rupees(left)} still owed.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'import_26as_credits') {
        tdsCreditRows.add({'section': '194J', 'tan': 'MUMD12345B', 'deductor': 'Delta Projects', 'customer': '', 'quarter': 'Q2 2026-27', 'in26as': 2000, 'inBooks': 0, 'gap': -2000, 'status': 'not in books'});
        return ChatReply.fromJson({'reply': 'Recorded 1 entry of TDS from Form 26AS totalling ₹2,000.00 (194J 1).', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'create_invoice') {
        invoices.add({
          'id': 'INV-0003',
          'date': '2026-10-05',
          'partyName': held.args['partyName'],
          'partyGstin': held.args['partyGstin'],
          'total': 9440,
          'status': 'posted',
          'receipts': <Object?>[],
        });
        return ChatReply.fromJson({
          'reply':
              'Posted INV-0003 to ${held.args['partyName']} for ₹9,440.00.',
          'posted': true,
          'confirmed': true,
        });
      }
      if (held.tool == 'match_bank_line') {
        final line = bankLines.firstWhere((l) => l['id'] == held.args['lineId']);
        final kind = held.args['kind'] as String;
        final suggestions = (line['suggestions'] as List<Object?>? ?? const <Object?>[]).cast<Map<String, Object?>>();
        final books = suggestions.where((s) => s['transferId'] == held.args['transferId']).firstOrNull;
        final id = kind == 'books'
            ? '${books?['docId'] ?? held.args['transferId']}'
            : '${held.args['invoiceId'] ?? held.args['billId'] ?? (kind == 'transfer' ? 'CTR-0001' : kind == 'ignore' || kind == 'interest' ? '' : 'EXP-0003')}';
        line['status'] = kind == 'books' ? 'matched' : kind == 'ignore' ? 'ignored' : 'booked';
        line['match'] = {
          'kind': kind,
          'id': id,
          'transferIds': [kind == 'books' ? '${held.args['transferId']}' : '1000${20 + bankLines.indexOf(line)}'],
          'ruleId': '',
          'note': held.args['note'] ?? '',
        };
        line['suggestions'] = const <Object?>[];
        if (held.args['remember'] == true) {
          bankRules.add({
            'id': 'BR-${(bankRules.length + 1).toString().padLeft(4, '0')}',
            'side': (line['in'] as num) > 0 ? 'in' : 'out',
            'contains': held.args['partyName'] ?? line['narration'],
            'pattern': '',
            'minAmount': null,
            'maxAmount': null,
            'then': {'kind': kind, 'partyName': held.args['partyName'] ?? '', 'head': held.args['head'] ?? '', 'otherAccount': held.args['otherAccount'] ?? '', 'note': held.args['note'] ?? ''},
            'hits': 1,
            'createdOn': '2026-10-05',
            'by': 'owner',
          });
        }
        return ChatReply.fromJson({'reply': 'Matched ${line['id']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'unmatch_bank_line') {
        final line = bankLines.firstWhere((l) => l['id'] == held.args['lineId']);
        line['status'] = 'unmatched';
        line['match'] = null;
        return ChatReply.fromJson({'reply': 'Unlinked ${line['id']}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'book_bank_charges') {
        var n = 0;
        for (final line in bankLines) {
          if (line['status'] != 'unmatched' || (held.args['account'] != null && line['account'] != held.args['account'])) continue;
          final charge = line['category'] == 'finance_cost' && (line['out'] as num) > 0;
          final interest = line['category'] == 'interest_income' && (line['in'] as num) > 0;
          if (!charge && !interest) continue;
          n += 1;
          line['status'] = 'booked';
          line['match'] = {'kind': charge ? 'charge' : 'interest', 'id': charge ? 'EXP-000$n' : '', 'transferIds': ['10003$n'], 'ruleId': '', 'note': ''};
          line['suggestions'] = const <Object?>[];
        }
        return ChatReply.fromJson({'reply': 'Booked $n ${n == 1 ? 'line' : 'lines'}.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'add_bank_rule') {
        final rule = <String, Object?>{
          'id': 'BR-${(bankRules.length + 1).toString().padLeft(4, '0')}',
          'side': held.args['side'] ?? 'any',
          'contains': held.args['contains'] ?? '',
          'pattern': held.args['pattern'] ?? '',
          'minAmount': held.args['minAmount'],
          'maxAmount': held.args['maxAmount'],
          'then': {'kind': held.args['kind'], 'partyName': held.args['partyName'] ?? '', 'head': held.args['head'] ?? '', 'otherAccount': held.args['otherAccount'] ?? '', 'note': held.args['note'] ?? ''},
          'hits': 0,
          'createdOn': '2026-10-05',
          'by': 'owner',
        };
        bankRules.add(rule);
        if (held.args['applyNow'] != false) _applyBankRule(rule);
        return ChatReply.fromJson({'reply': 'Rule ${rule['id']} added.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'remove_bank_rule') {
        bankRules.removeWhere((r) => r['id'] == held.args['id']);
        return ChatReply.fromJson({'reply': 'Rule ${held.args['id']} removed.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'run_bank_rules') {
        for (final rule in bankRules) {
          _applyBankRule(rule);
        }
        return ChatReply.fromJson({'reply': 'Rules run.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'set_bank_account') {
        bankAccounts.add({
          'id': '${1001 + bankAccounts.length}',
          'label': held.args['label'],
          'kind': held.args['kind'],
          'maskedNumber': held.args['maskedNumber'] ?? '',
          'ifsc': held.args['ifsc'] ?? '',
          'balance': 0,
          'builtIn': false,
        });
        return ChatReply.fromJson({'reply': 'Account ${held.args['label']} added.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'record_transfer') {
        final id = 'CTR-${(bankTransfers.length + 1).toString().padLeft(4, '0')}';
        final transferId = '${100124 + bankTransfers.length}';
        bankTransfers.add({
          'id': id,
          'date': held.args['date'],
          'fromAccount': held.args['fromAccount'],
          'toAccount': held.args['toAccount'],
          'amount': held.args['amount'],
          'reference': held.args['reference'] ?? '',
          'transferId': transferId,
          'by': 'owner',
        });
        if (held.args['fromAccount'] == '1002' || held.args['toAccount'] == '1002') {
          bankBooks.add({
            'transferId': transferId,
            'date': held.args['date'],
            'docKind': 'transfer',
            'docId': id,
            'party': '',
            'in': held.args['toAccount'] == '1002' ? held.args['amount'] : 0,
            'out': held.args['fromAccount'] == '1002' ? held.args['amount'] : 0,
          });
        }
        return ChatReply.fromJson({'reply': 'Transfer $id recorded.', 'posted': true, 'confirmed': true});
      }
      if (held.tool == 'import_bank' && held.args['post'] == 'hold') {
        final content = uploads[held.args['documentSha256']] ?? '';
        final rows = content.split('\n').skip(1).where((row) => row.trim().isNotEmpty).toList();
        for (final row in rows) {
          final cols = row.split(',');
          bankLines.add({
            'id': 'BL-${(bankLines.length + 1).toString().padLeft(6, '0')}',
            'account': held.args['account'] ?? '1002',
            'date': cols.first.trim(),
            'narration': cols.length > 1 ? cols[1].trim() : 'Statement line',
            'refNo': '',
            'in': cols.length > 3 ? num.tryParse(cols[3].trim()) ?? 0 : 0,
            'out': cols.length > 2 ? num.tryParse(cols[2].trim()) ?? 0 : 0,
            'balance': cols.length > 4 ? num.tryParse(cols[4].trim()) : null,
            'fingerprint': 'BANK-${bankLines.length}',
            'category': 'unclassified',
            'status': 'unmatched',
            'match': null,
            'importedOn': '2026-10-05',
            'fileLabel': 'statement',
            'tieBreak': false,
            'suggestions': <Object?>[],
          });
        }
        return ChatReply.fromJson({'reply': 'Bank statement: ${rows.length} lines wait for you to match.', 'posted': true, 'confirmed': true});
      }
      return ChatReply.fromJson({
        'reply': 'Done: ${held.tool}.',
        'posted': true,
        'confirmed': true,
      });
    }
    return ChatReply.fromJson({
      'reply': 'There is nothing waiting to be posted.',
      'posted': false,
    });
  }

  num _receivedOn(Map<String, Object?> invoice) => (invoice['receipts'] as List<Object?>? ?? const <Object?>[]).fold<num>(0, (sum, receipt) => sum + ((receipt as Map)['amount'] as num));

  void _applyBankRule(Map<String, Object?> rule) {
    final then = rule['then'] as Map<String, Object?>;
    final contains = '${rule['contains'] ?? ''}'.toLowerCase();
    for (final line in bankLines) {
      if (line['status'] != 'unmatched') continue;
      if (rule['side'] == 'in' && (line['in'] as num) <= 0) continue;
      if (rule['side'] == 'out' && (line['out'] as num) <= 0) continue;
      if (contains.isEmpty || !'${line['narration']}'.toLowerCase().contains(contains)) continue;
      final kind = then['kind'];
      line['status'] = kind == 'ignore' ? 'ignored' : 'booked';
      line['match'] = {
        'kind': kind,
        'id': kind == 'receipt' ? 'INV-0002' : kind == 'ignore' || kind == 'interest' ? '' : 'EXP-0004',
        'transferIds': ['100041'],
        'ruleId': rule['id'],
        'note': then['note'] ?? '',
      };
      line['suggestions'] = const <Object?>[];
      rule['hits'] = (rule['hits'] as int) + 1;
    }
  }

  @override
  Future<ChatReply> discard() async {
    discards += 1;
    _held = null;
    return ChatReply.fromJson({
      'reply': 'Not posted: nothing was waiting.',
      'posted': false,
    });
  }

  @override
  Future<ChatReply> chat(String message) async {
    sent.add(message);
    return ChatReply.fromJson({
      'reply': 'Customers owe you ₹3,77,600.00 in all: Gujarat Weaves ₹3,77,600.00. Nothing was recorded.',
    });
  }

  @override
  Future<ToolOutcome> updateCompany({
    required String name,
    String gstin = '',
  }) async {
    companyUpdates.add({'name': name, 'gstin': gstin});
    companyName = name;
    return const ToolOutcome(ok: true, error: '');
  }

  @override
  Future<Object?> query(
    String name, [
    Map<String, Object?> args = const {},
  ]) async {
    queries.add(name);
    queryArgs.add(QueryCall(name, args));
    switch (name) {
      case 'profit_and_loss':
        return {
          'ok': true,
          'data': {
            'from': args['from'] ?? '2026-04-01',
            'to': args['to'] ?? '2026-10-14',
            'income': [
              {'code': '4000', 'account': 'Sales', 'amount': 150000},
            ],
            'totalIncome': 150000,
            'expenses': [
              {'code': '5000', 'account': 'Purchases', 'amount': 60000},
              {'code': '5100', 'account': 'Operating expenses', 'amount': 15000},
            ],
            'totalExpenses': 75000,
            'netProfit': 75000,
            'undatedEntries': 0,
            'fileName': 'profit_and_loss_27AABCU9603R1ZN_2026-04-01_2026-10-14.csv',
            'csv': 'section,code,account,amount\n',
            'text': 'From 1 April 2026 to 14 October 2026: income ₹1,50,000.00, expenses ₹75,000.00, a profit of ₹75,000.00.',
          },
        };
      case 'balance_sheet':
        return {
          'ok': true,
          'data': {
            'asOf': args['asOf'] ?? '2026-10-14',
            'assets': [
              {'code': '1002', 'account': 'Bank', 'amount': 90000},
              {'code': '1100', 'account': 'Trade receivables', 'amount': 10000},
            ],
            'totalAssets': 100000,
            'liabilities': [
              {'code': '2100', 'account': 'GST output CGST', 'amount': 12500},
            ],
            'totalLiabilities': 12500,
            'equity': [
              {'code': '3000', 'account': 'Capital', 'amount': 12500},
              {'code': '', 'account': 'Profit to date', 'amount': 75000},
            ],
            'totalEquity': 87500,
            'balanced': true,
            'fileName': 'balance_sheet_27AABCU9603R1ZN_2026-10-14.csv',
            'csv': 'section,code,account,amount\n',
            'text': 'As at 14 October 2026: assets ₹1,00,000.00; liabilities ₹12,500.00 and equity ₹87,500.00. It balances.',
          },
        };
      case 'cash_flow_statement':
        return {
          'ok': true,
          'data': {
            'opening': 12500,
            'operating': {
              'lines': [
                {'label': 'Received from customers', 'in': 140000, 'out': 0, 'net': 140000},
                {'label': 'Paid to suppliers', 'in': 0, 'out': 62500, 'net': -62500},
              ],
              'net': 77500,
            },
            'investing': {'lines': [], 'net': 0},
            'financing': {'lines': [], 'net': 0},
            'netChange': 77500,
            'closing': 90000,
            'ties': true,
            'fileName': 'cash_flow_27AABCU9603R1ZN_2026-04-01_2026-10-14.csv',
            'csv': 'section,line,in,out,net\n',
            'text': 'From 1 April 2026 to 14 October 2026: cash and bank went from ₹12,500.00 to ₹90,000.00, a change of ₹77,500.00.',
          },
        };
      case 'customer_statement':
        if ((args['party'] as String? ?? '').toLowerCase() != 'kiran stores') {
          return {'ok': false, 'error': 'PARTY_NOT_FOUND', 'hint': 'No single customer matches. Customers include: Kiran Stores.'};
        }
        return {
          'ok': true,
          'data': {
            'customer': 'Kiran Stores',
            'opening': 0,
            'rows': [
              {'date': '2026-09-01', 'reference': 'INV-0001', 'entry': 'Invoice', 'charged': 11800, 'paid': 0, 'balance': 11800},
              {'date': '2026-09-20', 'reference': 'INV-0001', 'entry': 'Payment received', 'charged': 0, 'paid': 5000, 'balance': 6800},
            ],
            'closing': 6800,
            'fileName': 'statement_Kiran_Stores_2026-04-01_2026-10-14.csv',
            'csv': 'date,reference,entry,charged,paid,balance\n',
            'text': 'Kiran Stores, 1 April 2026 to 14 October 2026: 2 entries; Kiran Stores owes you ₹6,800.00.',
          },
        };
      case 'gst_period_summary':
        periodsAsked.add(args['period'] as String?);
        final august = args['period'] == '2026-08';
        return {
          'ok': true,
          'data': {
            'period': august ? '2026-08' : '2026-10',
            'periods': ['2026-08', '2026-10'],
            'salesCount': august ? 2 : 1,
            'purchaseCount': august ? 1 : 0,
            'taxableSales': august ? 150000 : 20000,
            'outputTax': august
                ? {'igst': 9000, 'cgst': 2500, 'sgst': 2500, 'total': 14000}
                : {'igst': 0, 'cgst': 1800, 'sgst': 1800, 'total': 3600},
            'inputCredit': august
                ? {'igst': 0, 'cgst': 1000, 'sgst': 1000, 'total': 2000}
                : {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
            'payment': august
                ? {
                    'period': '2026-08',
                    'output': {'igst': 9000, 'cgst': 2500, 'sgst': 2500, 'total': 14000},
                    'credit': {'igst': 0, 'cgst': 1000, 'sgst': 1000, 'total': 2000},
                    'broughtForward': {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
                    'broughtForwardKnown': false,
                    'creditUsed': 2000,
                    'cash': {'igst': 9000, 'cgst': 1500, 'sgst': 1500, 'total': 12000},
                    'toPay': 12000,
                    'carried': {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
                    'dueDate': '2026-09-20',
                    'filed': null,
                    'late': {'payOn': '2026-10-12', 'days': 22, 'interest': 130.19, 'lateFee': 1100, 'total': 13230.19},
                    'unreviewed': true,
                    'notes': ['Credit is set off head by head in the order the law sets.', 'The set-off order, interest rate and late fee come from the dated rules, which your CA has not reviewed yet.'],
                  }
                : {
                    'period': '2026-10',
                    'output': {'igst': 0, 'cgst': 1800, 'sgst': 1800, 'total': 3600},
                    'credit': {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
                    'broughtForward': {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
                    'broughtForwardKnown': false,
                    'creditUsed': 0,
                    'cash': {'igst': 0, 'cgst': 1800, 'sgst': 1800, 'total': 3600},
                    'toPay': 3600,
                    'carried': {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
                    'dueDate': '2026-11-20',
                    'filed': null,
                    'late': null,
                    'unreviewed': true,
                    'notes': ['Credit is set off head by head in the order the law sets.'],
                  },
            'gstr1': august
                ? {
                    'fp': '082026',
                    'b2b': 2,
                    'b2cl': 0,
                    'b2cs': 0,
                    'held': const <Object?>[],
                    'warnings': const <Object?>[],
                    'caveat': 'x',
                  }
                : {
                    'fp': '102026',
                    'b2b': 0,
                    'b2cl': 0,
                    'b2cs': 1,
                    'held': [
                      {'inum': 'INV-0009', 'code': 'INVALID_GSTIN'},
                    ],
                    'warnings': const <Object?>[],
                    'caveat': 'x',
                  },
          },
        };
      case 'record_share':
        if (args['outcome'] != 'cancelled') {
          shares.add({'on': '2026-10-05T10:00:00.000Z', 'by': 'u-owner', 'channel': args['channel'], 'outcome': args['outcome']});
        }
        return {'ok': true, 'invoiceId': args['invoiceId'], 'recorded': args['outcome'] != 'cancelled'};
      case 'estimated_tax_dates':
        return {
          'ok': true,
          'data': {
            'year': '2026',
            'installments': [
              {'installment': 1, 'covers': 'income from 1 January to 31 March', 'dueDate': '2026-04-15', 'past': true, 'paid': {'confirmation': 'EFTPS1', 'paidOn': '2026-04-10'}},
              {'installment': 2, 'covers': 'income from 1 April to 31 May', 'dueDate': '2026-06-15', 'past': true, 'paid': null},
              {'installment': 3, 'covers': 'income from 1 June to 31 August', 'dueDate': '2026-09-15', 'past': true, 'paid': null},
              {'installment': 4, 'covers': 'income from 1 September to 31 December', 'dueDate': '2027-01-15', 'past': false, 'paid': null},
            ],
            'unreviewed': true,
            'notes': const <Object?>[],
          },
        };
      case 'schedule_c_summary':
        return {
          'ok': true,
          'data': {'year': '2026', 'grossReceipts': 1000, 'returnsAndAllowances': 0, 'costOfGoodsSold': 324.75, 'grossIncome': 675.25, 'expenses': const <Object?>[], 'totalExpenses': 2080, 'excluded': 50, 'netProfit': -1404.75, 'notes': const <Object?>[]},
        };
      case 'us_payroll_filings':
        return {
          'ok': true,
          'data': {
            'year': '2026',
            'quarters': [
              {'quarter': '2026-Q3', 'months': 3, 'wages': 15000, 'federalWithholding': 1200, 'socialSecurityTax': 1860, 'medicareTax': 435, 'totalTaxes': 3495, 'dueDate': '2026-10-31', 'filed': null},
              {'quarter': '2026-Q4', 'months': 0, 'wages': 0, 'totalTaxes': 0, 'dueDate': '2027-01-31', 'filed': null},
            ],
            'w2': [
              {'employeeId': 'EMP-0001', 'name': 'Ravi Kumar', 'wages': 15000},
            ],
            'w2DueDate': '2027-01-31',
            'futa': {'total': 42},
            'notes': const <Object?>[],
          },
        };
      case 'contractor_payments':
        return {
          'ok': true,
          'data': {
            'year': '2026',
            'threshold': 2000,
            'contractors': [
              {'name': 'Joe Plumbing', 'entityType': 'sole-proprietor', 'w9Received': false, 'tinLast4': '', 'total': 2500, 'needs1099': true},
              {'name': 'Small Gig', 'entityType': 'individual', 'w9Received': true, 'tinLast4': '1111', 'total': 300, 'needs1099': false},
            ],
            'needing1099': 1,
            'missingW9': ['Joe Plumbing'],
            'notes': const <Object?>[],
          },
        };
      case 'contractor_1099_file':
        return {
          'ok': true,
          'data': {'year': '2026', 'payees': [{'recipient': 'Joe Plumbing', 'nonemployeeCompensation': 2500}], 'fileName': '1099NEC_EIN_2026.csv', 'csv': 'tax_year,recipient\n2026,Joe Plumbing\n'},
        };
      case 'read_document':
        readDocuments.add('${args['documentSha256']}');
        if (modelOff) return {'ok': false, 'error': 'MODEL_NOT_CONFIGURED'};
        return {
          'ok': true,
          'data': {
            'documentSha256': args['documentSha256'],
            'kind': 'supplier_bill',
            'extracted': {'supplierName': 'Ganga Mills', 'supplierGstin': '27AAACG1234A1Z5', 'invoiceNo': 'GM/221', 'date': '2026-10-03', 'lines': [{'description': 'Cotton yarn', 'hsn': '5205', 'qty': 10, 'rate': 1200, 'gstRate': 5}], 'total': 12600, 'confidence': 0.9},
            'proposal': {'tool': 'create_purchase', 'args': {'partyName': 'Ganga Mills', 'partyGstin': '27AAACG1234A1Z5', 'supplierInvoiceNo': 'GM/221', 'date': '2026-10-03', 'lines': [{'description': 'Cotton yarn', 'hsn': '5205', 'qty': 10, 'rate': 1200, 'gstRate': 5}]}},
            'confidence': 0.9,
            'warnings': const <Object?>[],
            'matches': documentMatches,
          },
        };
      case 'bank_reconciliation':
        final account = (args['account'] as String?) ?? '1002';
        final status = (args['status'] as String?) ?? 'all';
        final all = bankLines.where((l) => l['account'] == account).toList();
        String dateOf(Map<String, Object?> line) => line['date'] as String;
        Map<String, Object?> latest(List<Map<String, Object?>> lines) => lines.reduce((a, b) => dateOf(b).compareTo(dateOf(a)) >= 0 ? b : a);
        final to = all.isEmpty ? '2026-10-05' : dateOf(latest(all));
        final toDate = DateTime.parse(to);
        final from = (args['from'] as String?) ?? isoDate(DateTime(toDate.year, toDate.month, toDate.day - 90));
        final shown = all.where((l) => dateOf(l).compareTo(from) >= 0 && (status == 'all' || l['status'] == status)).toList();
        num sum(String key, bool Function(Map<String, Object?> line) test) => all.where(test).fold<num>(0, (total, l) => total + (l[key] as num));
        int count(String s) => all.where((l) => l['status'] == s).length;
        final unmatchedIn = sum('in', (l) => l['status'] == 'unmatched');
        final unmatchedOut = sum('out', (l) => l['status'] == 'unmatched');
        final books = account == '1002' ? bankBooks : const <Map<String, Object?>>[];
        final booksOnly = books.fold<num>(0, (total, b) => total + (b['in'] as num) - (b['out'] as num));
        final balanced = all.where((l) => l['balance'] != null).toList();
        final last = balanced.isEmpty ? null : latest(balanced);
        final statementBalance = last == null ? null : last['balance'] as num;
        final own = bankAccounts.firstWhere((a) => a['id'] == account, orElse: () => bankAccounts[1]);
        final booksBalance = statementBalance == null ? own['balance'] as num : statementBalance - unmatchedIn + unmatchedOut + booksOnly;
        var reconciledThrough = '';
        for (final l in all) {
          if (l['status'] == 'unmatched') break;
          reconciledThrough = dateOf(l);
        }
        return {
          'ok': true,
          'data': {
            'account': {'id': own['id'], 'label': own['label'], 'kind': own['kind']},
            'from': from,
            'to': to,
            'lines': shown,
            'books': books,
            'totals': {
              'statementBalance': statementBalance,
              'statementOn': last == null ? null : last['date'],
              'booksBalance': booksBalance,
              'difference': statementBalance == null ? null : statementBalance - booksBalance,
              'lines': {'unmatched': count('unmatched'), 'matched': count('matched'), 'booked': count('booked'), 'ignored': count('ignored')},
              'unmatchedIn': unmatchedIn,
              'unmatchedOut': unmatchedOut,
            },
            'reconciledThrough': reconciledThrough,
            'rules': bankRules,
            'accounts': [
              for (final a in bankAccounts) {'id': a['id'], 'label': a['label'], 'kind': a['kind'], 'balance': a['balance']},
            ],
          },
        };
      case 'list_bank_rules':
        return {'ok': true, 'data': {'rules': bankRules}};
      case 'list_bank_accounts':
        return {'ok': true, 'data': {'accounts': bankAccounts}};
      case 'export_xlsx':
        final report = '${args['report'] ?? 'trial_balance'}'.replaceAll('_', '-');
        final when = '${args['period'] ?? args['name'] ?? '2026-10-05'}'.toLowerCase().replaceAll(RegExp(r'[^a-z0-9-]+'), '-');
        return {
          'ok': true,
          'data': {
            'fileName': 'myca-$report-$when.xlsx',
            'contentType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xlsxBase64': base64Encode(utf8.encode('PK\u0003\u0004test')),
            'sheets': [
              {'name': report, 'rows': 2},
            ],
            'rows': 2,
          },
        };
      case 'list_reports':
        return {'ok': true, 'reports': savedReports};
      case 'audit_trail':
        final cut = auditMore && args['limit'] == null;
        return {
          'ok': true,
          'data': {
            'from': '2026-10-01',
            'to': '2026-10-31',
            'label': 'October 2026',
            'view': args['view'] ?? 'changes',
            'events': auditEvents,
            'count': auditEvents.length,
            'total': cut ? auditEvents.length + 3 : auditEvents.length,
            'more': cut,
            'chain': auditChain,
            'ledger': auditLedgerOk ? {'ok': true, 'last': 1234} : {'ok': false, 'error': 'checksum_mismatch', 'at': '7'},
            'note': 'Every change made through MyCA is listed with who made it and when.',
          },
        };
      case 'list_recurring':
        return {'ok': true, 'data': {'schedules': recurring}};
      case 'run_report':
        final report = savedReports.where((r) => r['name'] == args['name']).firstOrNull;
        if (report == null) return {'ok': false, 'error': 'REPORT_NOT_FOUND'};
        final compared = report['compare'] == true;
        return {
          'ok': true,
          'name': report['name'],
          'result': {
            'metric': report['metric'],
            'groupBy': report['groupBy'],
            'period': report['period'],
            'range': {'label': 'October 2026', 'from': '2026-10-01', 'to': '2026-10-31'},
            'rows': [
              {'label': 'Retail Mart', 'amount': 525000},
              {'label': 'Gujarat Weaves', 'amount': 63000},
            ],
            'more': report['name'] == 'Expenses this quarter' ? 3 : 0,
            'total': 588000,
            'compare': compared
                ? {
                    'label': '2026-09',
                    'total': 525000,
                    'changePct': 12,
                    'rows': [
                      {'label': 'Retail Mart', 'before': 500000},
                      {'label': 'Gujarat Weaves', 'before': 25000},
                    ],
                  }
                : null,
          },
        };
      case 'schedule_se':
        return country == 'US' ? {'ok': true, 'data': {'year': '2026', 'netEarnings': 46175, 'selfEmploymentTax': 7064.78, 'deduction': 3532.39, 'additionalMedicareTax': 0, 'unreviewed': true, 'lines': const <Object?>[]}} : {'ok': false, 'error': 'NOT_FOR_COUNTRY'};
      case 'schedule_c_document':
        return {'ok': true, 'data': {'year': args['year'], 'fileName': 'schedule_c_${args['year']}.html', 'html': '<!doctype html><html><body>Schedule C</body></html>'}};
      case 'cpa_pack':
        return {'ok': true, 'data': {'year': args['year'], 'fileName': 'cpa_pack_${args['year']}.json', 'pack': {'year': args['year'], 'scheduleC': {'netProfit': 50000}}}};
      case 'payroll_941_file':
        return {'ok': true, 'data': {'quarter': args['quarter'], 'fileName': 'form_941_${args['quarter']}.csv', 'csv': 'line,description,amount\n2,Wages,25000\n'}};
      case 'payroll_w2_file':
        return {'ok': true, 'data': {'year': args['year'], 'fileName': 'forms_w2_w3_${args['year']}.csv', 'csv': 'form,employee\nW-2,Ana Lopez\n'}};
      case 'list_amendments':
        return {'ok': true, 'data': {'amendments': amendments, 'count': amendments.length}};
      case 'registrations':
        return {
          'ok': true,
          'data': {
            'several': severalRegistrations,
            'registrations': [
              {'gstin': '27AABCU9603R1ZN', 'state': '27', 'stateName': 'Maharashtra', 'kind': 'principal', 'label': 'Principal', 'effectiveFrom': '', 'effectiveTo': '', 'invoices': 14, 'purchases': 9, 'periods': const [], 'open': 0},
              if (severalRegistrations)
                {'gstin': '29AABCU9603R1ZJ', 'state': '29', 'stateName': 'Karnataka', 'kind': 'apob', 'label': 'Amazon BLR', 'effectiveFrom': '2026-09-01', 'effectiveTo': '', 'invoices': 3, 'purchases': 1, 'periods': const [], 'open': 0},
            ],
          },
        };
      case 'settlement_status':
        return {
          'ok': true,
          'data': {
            'total': 2,
            'settlements': [
              {'id': 'STL-0002', 'channel': 'amazon', 'settlementId': '12345678902', 'from': '2026-09-16', 'to': '2026-09-30', 'orders': 61, 'expected': 92000, 'paid': 90500, 'shortfall': 1500, 'status': 'short'},
              {'id': 'STL-0001', 'channel': 'amazon', 'settlementId': '12345678901', 'from': '2026-09-01', 'to': '2026-09-15', 'orders': 58, 'expected': 92000, 'paid': 92000, 'shortfall': 0, 'status': 'matched'},
            ],
            'byChannel': {
              'amazon': {'settlements': 2, 'expected': 184000, 'paid': 182500, 'short': 1500, 'unmatched': 0, 'penalties': 250, 'tcs': 920, 'tds': 920, 'latest': '2026-10-01'},
            },
          },
        };
      case 'marketplace_credits':
        return {
          'ok': true,
          'data': {
            'tcs': const [],
            'tds': const [],
            'totals': {'tcsRecorded': 920, 'tcsReported': 900, 'tcsUsedInGst': 0, 'tcsAvailable': 900, 'tdsRecorded': 920, 'tdsIn26as': 0},
            'channels': const {},
          },
        };
      case 'sku_margins':
        return {
          'ok': true,
          'data': {
            'period': '',
            'rows': [
              {'sku': 'SKU-B', 'channel': 'amazon', 'units': 10, 'returnedUnits': 1, 'net': 4500, 'fees': 1200, 'cogs': 4320, 'margin': -1020, 'marginPercent': -22.67, 'costMissing': false},
              {'sku': 'SKU-A', 'channel': 'amazon', 'units': 40, 'returnedUnits': 2, 'net': 38000, 'fees': 6100, 'cogs': 15200, 'margin': 16700, 'marginPercent': 43.95, 'costMissing': false},
            ],
            'byChannel': {'amazon': {'units': 47, 'net': 42500, 'fees': 7300, 'cogs': 19520, 'margin': 15680, 'marginPercent': 36.89}},
            'negative': const [],
            'costMissing': const [],
            'totals': {'net': 42500, 'fees': 7300, 'cogs': 19520, 'margin': 15680},
          },
        };
      case 'stock_moves':
        return {
          'ok': true,
          'data': {
            'sku': args['sku'], 'location': args['location'], 'onHand': 58, 'total': 3,
            'moves': [
              {'date': '2026-10-01', 'sku': 'SKU-A', 'qty': -2, 'location': 'amazon', 'kind': 'out', 'ref': 'INV-0031', 'note': 'Sold on amazon, order 403-9'},
              {'date': '2026-09-02', 'sku': 'SKU-A', 'qty': 60, 'location': 'amazon', 'kind': 'in', 'ref': 'BILL-0007', 'note': 'Received from Principal'},
            ],
          },
        };
      case 'stock_position':
        return {
          'ok': true,
          'data': {
            'rows': [
              {'sku': 'SKU-A', 'location': 'amazon', 'qty': 58, 'name': '', 'cost': 400, 'value': 23200, 'lastMove': '2026-10-01'},
              {'sku': 'SKU-B', 'location': 'amazon', 'qty': -1, 'name': 'Cotton scarf', 'cost': 480, 'value': -480, 'lastMove': '2026-10-01'},
            ],
            'negative': [{'sku': 'SKU-B', 'location': 'amazon', 'qty': -1}],
            'value': 22720,
          },
        };
      case 'daily_close':
        return {
          'ok': true,
          'data': {
            'day': '2026-10-05',
            'status': 'needs you',
            'needsYou': ['Bank statement current', 'Settlements matched to the bank'],
            'checklist': [
              {'item': 'Sales posted', 'ok': true, 'detail': '2 today, 14 this month'},
              {'item': 'Purchases and expenses posted', 'ok': true, 'detail': '1 today, 9 this month'},
              {'item': 'Bank statement current', 'ok': false, 'detail': 'last balance 2026-09-28, 7 days ago'},
              {'item': 'Settlements matched to the bank', 'ok': false, 'detail': '3 imported, 1 not in the bank'},
              {'item': 'TCS and TDS 194-O confirmed', 'ok': true, 'detail': 'no gaps'},
              {'item': 'Margins positive', 'ok': true, 'detail': '0 SKUs losing money in 2026-09'},
              {'item': 'Nothing high-severity open', 'ok': true, 'detail': '2 open, 0 high'},
            ],
            'sales': {'today': 2, 'todayTotal': 5000, 'month': 14, 'monthTotal': 412000},
            'purchases': {'today': 1, 'todayTotal': 1000, 'month': 6, 'monthTotal': 90000},
            'expenses': {'today': 0, 'todayTotal': 0, 'month': 3, 'monthTotal': 12000},
            'cash': {'bank': 184000, 'cash': 2000, 'source': 'reading', 'readingOn': '2026-09-28'},
            'receivable': 277600,
            'exceptions': {'count': 2, 'bySeverity': {'high': 0, 'medium': 2, 'low': 0}, 'moneyAtRisk': 1200},
            'settlements': {'imported': 3, 'unmatched': 1, 'short': 0, 'latest': '2026-10-01'},
            'credits': {'gaps': 0, 'tcsAvailable': 0},
            'margins': null,
          },
        };
      case 'week_ahead':
        return {
          'ok': true,
          'data': {
            'today': '2026-10-05',
            'until': '2026-10-12',
            'items': [
              {'kind': 'filing', 'when': '2026-10-11', 'overdue': false, 'title': 'GSTR-1 (monthly) for 2026-09', 'detail': 'Due 2026-10-11'},
              {'kind': 'receivable', 'when': '2026-09-30', 'overdue': true, 'title': 'Gujarat Weaves owes 277600 on INV-0002', 'detail': 'Overdue since 2026-09-30', 'amount': 277600, 'invoiceId': 'INV-0002'},
            ],
            'overdue': 1,
            'count': 2,
          },
        };
      case 'supplier_dues':
        return {'ok': true, 'data': supplierDues};
      case 'list_suta_rates':
        return {'ok': true, 'data': {'rates': sutaRates}};
      case 'list_year_closings':
        return {'ok': true, 'data': {'closings': yearClosed ? [{'year': '2025-26', 'income': 100000, 'expenses': 20000, 'profit': 80000, 'closedOn': '2026-10-05'}] : const <Object?>[], 'nextYear': '2025-26'}};
      case 'export_gstr1_quarter':
        return {'ok': true, 'data': {'quarter': args['quarter'], 'invoices': 3, 'fileName': 'GSTR1_27AABCU9603R1ZN_Q2-2026-27.json', 'b2b': const <Object?>[], 'note': 'One file for the quarter.'}};
      case 'export_iff':
        return {'ok': true, 'data': {'period': args['period'], 'invoices': 1, 'fileName': 'IFF_27AABCU9603R1ZN_082026.json', 'note': 'B2B only.'}};
      case 'rules_status':
        return {
          'ok': true,
          'data': {
            'asOf': '2026-10-05',
            'country': country,
            'totals': {'records': country == 'US' ? 4 : 164, 'attested': 0, 'gaps': 0, 'ending': country == 'US' ? 0 : 1},
            'families': [
              {'key': 'holiday', 'title': 'Gazetted holiday calendar', 'attention': country != 'US'},
            ],
            'notes': [country == 'US' ? 'No rule has been reviewed by a US CPA yet; figures carry a not-reviewed note until one attests.' : 'No rule has been reviewed by your CA yet; figures carry a not-reviewed note until one attests.'],
          },
        };
      case 'sales_tax_overview':
        return {
          'ok': true,
          'data': {
            'states': [
              for (final row in salesTaxStates)
                {
                  'state': row['state'],
                  'frequency': row['frequency'],
                  'permitNo': '',
                  'lastPeriod': {
                    'period': '2026-Q3',
                    'taxCollected': 53.75,
                    'toPay': salesTaxPaid ? 0 : 53.75,
                    'dueDate': '2026-10-20',
                    'filed': salesTaxFiled ? {'confirmation': 'TX778899', 'filedOn': '2026-10-05', 'late': false} : null,
                    'approved': salesTaxApproved,
                    'empty': false,
                    'ended': true,
                  },
                  'currentPeriod': {'period': '2026-Q4', 'taxCollected': 8.25, 'invoices': 1},
                  'overdue': false,
                  'notes': const ['The due date comes from a dated rule your CPA has not reviewed yet.'],
                },
            ],
            'overdue': 0,
            'hasNexus': salesTaxStates.isNotEmpty,
          },
        };
      case 'sales_tax_review':
        return {
          'ok': true,
          'data': {
            'state': 'TX',
            'period': '2026-Q3',
            'periods': ['2026-Q3'],
            'month': 'TX 2026-Q3',
            'draftHash': 'd' * 64,
            'empty': false,
            'changed': false,
            'steps': [
              {
                'id': 'sales',
                'title': 'Sales in TX for 2026-Q3',
                'lines': [
                  {'label': 'Gross sales on 3 invoices', 'amount': 940},
                  {'label': 'Taxable sales', 'amount': 700, 'strong': true},
                ],
                'note': 'Every figure comes from the invoices in this period.',
                'question': 'Is this information correct?',
                'yes': 'Yes, correct',
                'no': 'Something is wrong',
                'status': salesTaxApproved ? 'confirmed' : 'open',
                'waitingFor': null,
                'answer': null,
              },
            ],
            'next': salesTaxApproved ? null : 'sales',
            'approved': salesTaxApproved,
            'approval': null,
          },
        };
      case 'list_sales_tax_rates':
        return {
          'ok': true,
          'data': {
            'rates': [
              {'code': 'TX-AUSTIN', 'name': 'Austin, Texas', 'ratePercent': 8.25, 'from': '2026-01-01', 'history': 1},
            ],
          },
        };
      case 'invoice_document':
        if (args['id'] != 'INV-0002') {
          return {'ok': false, 'error': 'INVOICE_NOT_FOUND'};
        }
        if (country == 'US') {
          return {
            'ok': true,
            'data': {
              'id': 'INV-0002',
              'date': '2026-08-12',
              'country': 'US',
              'seller': {'name': 'Maple Street Bakery', 'gstin': '', 'address': '12 Maple St', 'city': 'Austin', 'pin': '78701', 'state': {'code': '', 'name': ''}},
              'buyer': {'name': 'Gujarat Weaves', 'gstin': '', 'address': buyerAddress},
              'shares': shares,
              'placeOfSupply': {'code': '', 'name': ''},
              'lines': [
                {'description': 'Wedding cake', 'hsn': '', 'qty': 1, 'rate': 500, 'gstRate': 0, 'taxable': 500, 'cgst': 0, 'sgst': 0, 'igst': 0, 'amount': 541.25, 'taxRate': 8.25, 'salesTax': 41.25},
                {'description': 'Delivery', 'hsn': '', 'qty': 1, 'rate': 40, 'gstRate': 0, 'taxable': 0, 'cgst': 0, 'sgst': 0, 'igst': 0, 'amount': 40, 'taxRate': 0, 'salesTax': 0},
              ],
              'taxable': 540,
              'subtotal': 540,
              'salesTax': 41.25,
              'taxJurisdiction': 'TX-AUSTIN',
              'taxRate': 8.25,
              'taxExempt': false,
              'exemptionReason': '',
              'cgst': 0,
              'sgst': 0,
              'igst': 0,
              'total': 581.25,
              'receipts': const [],
              'received': 0,
              'credited': 0,
              'creditNotes': const [],
              'status': 'open',
              'balance': 581.25,
              'missing': const [],
            },
          };
        }
        return {
          'ok': true,
          'data': {
            'id': 'INV-0002',
            'date': '2026-08-12',
            'seller': {
              'name': 'Nalanda Textiles LLP',
              'gstin': '27AAACN1234F1Z5',
              'address': '12 Market Road',
              'city': 'Pune',
              'pin': '411001',
              'state': {'code': '27', 'name': 'Maharashtra'},
            },
            'buyer': {'name': 'Gujarat Weaves', 'gstin': '24AAACG1234F1Z5', 'address': buyerAddress},
            'shares': shares,
            'ewayBill': {
              'needed': true,
              'why': 'Goods worth ₹3,77,600.00 move to another state, above the ₹50,000.00 limit.',
              'status': transport == null ? 'transport-needed' : 'irn-needed',
              'transport': transport == null ? null : {'words': '${transport!['distanceKm']} km by road, vehicle ${transport!['vehicleNo']}'},
              'ewbNo': '',
              'ewbValidity': '',
              'next': transport == null ? 'Add the vehicle, distance and transporter, then the e-way bill can be generated.' : 'Generate the e-invoice (IRN) first; the e-way bill is generated from it through the action gate.',
            },
            'placeOfSupply': {'code': '24', 'name': 'Gujarat'},
            'lines': [
              {
                'description': 'Silk rolls',
                'hsn': '5007',
                'qty': 3,
                'rate': 100000,
                'gstRate': 18,
                'taxable': 300000,
                'cgst': 0,
                'sgst': 0,
                'igst': 54000,
                'amount': 354000,
              },
              {
                'description': 'Design work',
                'hsn': '',
                'qty': 1,
                'rate': 22476.19,
                'gstRate': 5,
                'taxable': 22476.19,
                'cgst': 0,
                'sgst': 0,
                'igst': 1123.81,
                'amount': 23600,
              },
            ],
            'taxable': 322476.19,
            'cgst': 0,
            'sgst': 0,
            'igst': 55123.81,
            'total': 377600,
            'receipts': [
              {'amount': 100000, 'date': '2026-08-20', 'mode': 'bank'},
            ],
            'received': 100000,
            'credited': creditNotes.fold<num>(
              0,
              (sum, n) => sum + (n['total'] as num),
            ),
            'creditNotes': creditNotes,
            'debited': debitNotes.fold<num>(
              0,
              (sum, n) => sum + (n['total'] as num),
            ),
            'debitNotes': debitNotes,
            'status': invoices[1]['status'],
            'paymentTermsDays': 30,
            'dueDate': '2026-09-11',
            'balance':
                277600 -
                creditNotes.fold<num>(0, (sum, n) => sum + (n['total'] as num)),
            'missing': ['HSN'],
          },
        };
      case 'quote_document':
        final quote = quotes.firstWhere((q) => q['id'] == args['id']);
        return {
          'ok': true,
          'data': {
            'id': quote['id'],
            'date': quote['date'],
            'kind': 'quote',
            'documentKind': quote['kind'] ?? 'quote',
            'reason': quote['reason'] ?? '',
            'validUntil': quote['validUntil'],
            'status': quote['status'],
            'invoiceId': quote['invoiceId'],
            'seller': {
              'name': 'Nalanda Textiles LLP',
              'gstin': '27AAACN1234F1Z5',
              'address': '12 Market Road',
              'state': {'code': '27', 'name': 'Maharashtra'},
            },
            'buyer': {'name': quote['partyName'], 'gstin': quote['partyGstin']},
            'placeOfSupply': {'code': '24', 'name': 'Gujarat'},
            'lines': [
              {
                'description': 'Consulting',
                'hsn': '998311',
                'qty': 1,
                'rate': 50000,
                'gstRate': 18,
                'taxable': 50000,
                'cgst': 0,
                'sgst': 0,
                'igst': 9000,
                'amount': 59000,
              },
            ],
            'taxable': 50000,
            'cgst': 0,
            'sgst': 0,
            'igst': 9000,
            'total': 59000,
            'receipts': const <Object?>[],
            'received': 0,
            'credited': 0,
            'creditNotes': const <Object?>[],
            'balance': 59000,
            'missing': const <Object?>[],
          },
        };
      case 'list_ca_requests':
        final status = args['status'] ?? 'open';
        return {
          'ok': true,
          'data': {
            'requests': caRequests
                .where(
                  (r) =>
                      status == 'all' ||
                      (status == 'closed') == (r['status'] == 'closed'),
                )
                .toList(),
          },
        };
      case 'cash_forecast':
        return {
          'ok': true,
          'data': {
            'from': '2026-10-05',
            'until': '2026-11-04',
            'days': 30,
            'start': hasBalance
                ? {
                    'amount': 300000,
                    'bank': 295000,
                    'cash': 5000,
                    'source': 'reading',
                    'readingOn': '2026-10-05',
                    'note': 'From the balance you gave.',
                  }
                : {
                    'amount': 10000,
                    'bank': 10000,
                    'cash': 0,
                    'source': 'recorded',
                    'readingOn': '',
                    'note':
                        'This is only what has been recorded in MyCA, not your bank statement.',
                  },
            'coming': {
              'total': 20000,
              'rows': [
                {
                  'date': '2026-10-15',
                  'label': 'INV-0002 from Gujarat Weaves',
                  'amount': 20000,
                  'basis': 'Gujarat Weaves usually pays in 10 days',
                },
              ],
            },
            'going': {
              'total': 9000,
              'rows': [
                {
                  'date': '2026-11-04',
                  'label': 'Usual expenses',
                  'amount': 5000,
                  'basis': 'average of 2026-07 to 2026-09',
                },
                {
                  'date': '2026-10-20',
                  'label': 'GST for 2026-09',
                  'amount': 4000,
                  'basis': 'before head-by-head set-off',
                },
              ],
            },
            'overdue': {'total': 7000, 'rows': const <Object?>[]},
            'end': hasBalance ? 311000 : 21000,
            'lowest': {
              'date': '2026-10-14',
              'amount': hasBalance ? 298000 : 8000,
            },
            'monthlyOutgoings': 60000,
            'notes': [
              'Overdue invoices are listed but not counted.',
              'Supplier payments are not recorded against bills yet.',
            ],
          },
        };
      case 'can_afford':
        final amount = args['amount'] as num;
        return {
          'ok': true,
          'data': {
            'amount': amount,
            'on': args['on'],
            'balanceThen': 300000,
            'left': 300000 - amount,
            'monthlyOutgoings': 60000,
            'monthsCovered': ((300000 - amount) / 60000 * 100).round() / 100,
            'verdict': amount <= 240000
                ? 'yes'
                : (amount <= 300000 ? 'tight' : 'no'),
            'safeToSpend': 240000,
          },
        };
      case 'list_reminders':
        return {
          'ok': true,
          'data': {
            'today': '2026-10-05',
            'reminders': reminders,
            'due': reminders.where((r) => r['state'] == 'today').length,
          },
        };
      case 'books_check':
        return {
          'ok': true,
          'data': {
            'asOfDate': '2026-10-05',
            'headline': '1 thing needs you now',
            'counts': {'act': 1, 'check': 1, 'ok': 1},
            'findings': [
              {
                'id': 'held',
                'severity': 'act',
                'title': '1 sale cannot go in the GST return as it stands',
                'detail': 'Tax of ₹100.00 on INV-0009.',
                'action': 'taxes',
              },
              {
                'id': 'owed',
                'severity': 'check',
                'title': 'Customers owe you ₹3,77,600.00',
                'detail': 'On 1 invoice. The largest is Gujarat Weaves.',
                'action': 'sales',
              },
              {
                'id': 'ledger',
                'severity': 'ok',
                'title': 'Your books tie',
                'detail': 'Every entry has a matching debit and credit.',
              },
            ],
          },
        };
      case 'credit_at_risk':
        return {
          'ok': true,
          'data': {
            'period': args['period'],
            'statement': has2b
                ? {
                    'fileName': 'GSTR2B_102026.csv',
                    'importedOn': '2026-10-05',
                    'rows': 4,
                  }
                : null,
            'bills': 3,
            'creditInBooks': 4400,
            'creditMatched': has2b ? 500 : 0,
            'creditAtRisk': has2b ? 3900 : 4400,
            'risks': has2b
                ? [
                    {
                      'billId': 'BILL-0002',
                      'supplierInvoiceNo': 'GM/77',
                      'supplier': 'Gujarat Mills',
                      'gstin': '24AAACF7856R1ZY',
                      'date': '2026-10-08',
                      'credit': 3600,
                      'reason': 'ITC_NOT_AVAILABLE',
                      'why':
                          'The supplier reported it, but 2B marks the credit as not available.',
                    },
                    {
                      'billId': 'BILL-0003',
                      'supplierInvoiceNo': '',
                      'supplier': 'Box Mart',
                      'gstin': '27AAACB2222B1Z5',
                      'date': '2026-10-16',
                      'credit': 300,
                      'reason': 'NO_SUPPLIER_NUMBER',
                      'why':
                          "Add the supplier's bill number so it can be found in 2B.",
                    },
                  ]
                : const <Object?>[],
            'bySupplier': has2b
                ? [
                    {
                      'supplier': 'Gujarat Mills',
                      'gstin': '24AAACF7856R1ZY',
                      'credit': 3600,
                      'bills': 1,
                    },
                    {
                      'supplier': 'Box Mart',
                      'gstin': '27AAACB2222B1Z5',
                      'credit': 300,
                      'bills': 1,
                    },
                  ]
                : const <Object?>[],
            'notBooked': has2b
                ? [
                    {
                      'supplier': 'RETAIL SUPPLY',
                      'gstin': '27AAACH7409R1Z1',
                      'invoiceNo': 'RS-1',
                      'date': '2026-10-15',
                      'credit': 180,
                    },
                  ]
                : const <Object?>[],
          },
        };
      case 'ims_review':
        final listed = has2b ? imsRows : const <Map<String, Object?>>[];
        num creditOf(String decision) => listed.where((r) => r['decision'] == decision).fold<num>(0, (sum, r) => sum + (r['credit'] as num));
        return {
          'ok': true,
          'data': {
            'period': args['period'],
            'statement': has2b ? {'fileName': 'GSTR2B_102026.csv', 'importedOn': '2026-10-05', 'rows': imsRows.length} : null,
            'rows': listed,
            'counts': {
              'total': listed.length,
              'accept': listed.where((r) => r['decision'] == 'accept').length,
              'reject': listed.where((r) => r['decision'] == 'reject').length,
              'pending': listed.where((r) => r['decision'] == 'pending').length,
              'undecided': listed.where((r) => r['decision'] == '').length,
            },
            'credit': {
              'accepted': creditOf('accept'),
              'rejected': creditOf('reject'),
              'pending': creditOf('pending'),
              'undecided': creditOf(''),
            },
            'orphaned': imsOrphaned,
            'note': "MyCA keeps these decisions for you but does not send them to the GST portal. Take the same decisions on the portal's IMS; the Excel sheet lists every row with its suggestion.",
          },
        };
      case 'gst_payable':
        return {'ok': true, 'data': {'period': args['period'], 'toPay': {'igst': 0, 'cgst': 1800, 'sgst': 1800, 'total': 3600}, 'paid': gstPaid ? {'date': '2026-10-05', 'cpin': '26100012345678', 'cashTotal': 3600} : null, 'notes': const <Object?>[]}};
      case 'gstr9_draft':
        return {
          'ok': true,
          'data': {'fy': '2026-27', 'form': 'GSTR-9', 'gstin': '27AABCU9603R1ZN', 'table4': {'outwardTaxable': 120000}, 'table6': {'itcAvailed': {'total': 2000}}, 'table9': {'paidInCash': {'total': 3600}}, 'table17': const <Object?>[], 'notes': const <Object?>[]},
        };
      case 'export_trial_balance':
        return {
          'ok': true,
          'data': {
            'asOf': '2026-10-05',
            'currency': 'INR',
            'accounts': 6,
            'debit': 377600,
            'credit': 377600,
            'balanced': true,
            'fileName': 'trial_balance_27AABCU9603R1ZN_2026-10-05.csv',
            'csv': 'code,account,type,debits_posted,credits_posted,closing_debit,closing_credit\n1002,Bank,asset,100000,0,100000,0\n',
          },
        };
      case 'export_entries':
        return {
          'ok': true,
          'data': {
            'period': args['period'],
            'count': 3,
            'fileName': 'entries_27AABCU9603R1ZN_${args['period']}.csv',
            'csv': 'date,type,number\n2026-10-02,Sale,INV-0003',
          },
        };
      case 'gst_review':
        return {'ok': true, 'data': reviewData()};
      case 'business_summary':
        return {
          'ok': true,
          'data': {
            'period': '2026-10',
            'previousPeriod': '2026-09',
            'current': {
              'sales': {'count': 1, 'total': 20000, 'net': 20000},
              'creditNotes': {'count': 0, 'total': 0},
              'purchases': {'count': 1, 'total': 42000},
              'expenses': {'count': 1, 'total': 5000},
              'payroll': {'status': payrollApproved ? 'approved' : 'draft', 'employees': 1, 'gross': payrollApproved ? 30000 : 0, 'net': payrollApproved ? 28000 : 0, 'employerCost': payrollApproved ? 32375 : 0, 'paidOn': payrollPaid ? '2026-10-05' : ''},
            },
            'previous': {
              'sales': {'count': 2, 'total': 902600, 'net': 902600},
              'creditNotes': {'count': 0, 'total': 0},
              'purchases': {'count': 0, 'total': 0},
              'expenses': {'count': 1, 'total': 12000},
              'payroll': {'status': 'approved', 'employees': 1, 'gross': 30000, 'net': 28000, 'employerCost': 32375, 'paidOn': '2026-09-05'},
            },
            'owedToYou': {
              'total': 377600,
              'invoices': 1,
              'customers': [
                {'name': 'Gujarat Weaves', 'due': 377600, 'invoices': 1},
              ],
            },
            'owedBySuppliers': {
              'total': 42000,
              'bills': 1,
              'suppliers': [
                {'name': 'Fabric Co', 'due': 42000, 'bills': 1},
              ],
            },
            'caveat':
                'What you owe suppliers counts only payments recorded against bills.',
          },
        };
      case 'filing_pack':
        return {
          'ok': true,
          'data': {
            'gstin': '27AABCU9603R1ZN',
            'period': args['period'],
            'gstr1': {'b2b': const <Object?>[]},
            'gstr3b': {'outward': {'taxable': 20000}},
            'payable': 3600,
            'trialBalance': {'balanced': true},
            'caveat': 'Prepared locally. A practising CA must review and file on GSTN.',
          },
        };
      case 'export_tally':
        return {
          'ok': true,
          'data': {
            'period': args['period'],
            'count': 4,
            'ledgers': 12,
            'fileName': 'tally_27AAACN1234F1Z5_${args['period']}.xml',
            'xml': '<ENVELOPE></ENVELOPE>',
          },
        };
      case 'expense_heads':
        return {
          'ok': true,
          'data': [
            {'code': '5100', 'name': 'Other expenses'},
            {'code': '5110', 'name': 'Rent'},
            {'code': '5190', 'name': 'Office and stationery'},
            {'code': '5200', 'name': 'Advertising and marketing'},
          ],
        };
      case 'export_gstr1_json':
        return {
          'ok': true,
          'data': {
            'gstin': '27AABCU9603R1ZN',
            'fp': args['fp'],
            'version': 'GST3.1.6',
            'b2b': const <Object?>[],
          },
        };
      case 'tds_summary':
        return {
          'ok': true,
          'data': {
            'deductor': tdsDeductor,
            'tan': tdsDeductor ? 'MUMA12345B' : '',
            'deducted': tdsDeductor ? 6000 : 0,
            'deposited': tdsDeductor ? 6000 - tdsDue : 0,
            'due': tdsDeductor ? tdsDue : 0,
            'months': tdsDeductor
                ? [
                    {'month': '2026-10', 'deducted': 6000, 'depositBy': '2026-11-07'},
                  ]
                : const <Object?>[],
            'quarters': tdsDeductor
                ? [
                    {'quarter': 'Q3 2026-27', 'deducted': 6000, 'deposited': 6000 - tdsDue, 'shortfall': tdsDue, 'dueDate': '2027-01-31', 'form': '140', 'approved': false, 'filed': null},
                  ]
                : const <Object?>[],
          },
        };
      case 'tds_credit_check':
        num sumOf(bool Function(Map<String, Object?> row) wanted, String key) => tdsCreditRows.where(wanted).fold<num>(0, (total, row) => total + (row[key] as num));
        return {
          'ok': true,
          'data': {
            'fy': '2026-27',
            'source': tdsCreditRows.isEmpty ? 'no 26AS imported yet' : '26AS imported 2026-10-02',
            'rows': tdsCreditRows,
            'totals': {
              'in26as': sumOf((row) => true, 'in26as'),
              'inBooks': sumOf((row) => true, 'inBooks'),
              'gap': sumOf((row) => true, 'gap'),
              'notInBooks': sumOf((row) => row['status'] == 'not in books', 'in26as'),
              'notIn26as': sumOf((row) => row['status'] == 'not in 26AS', 'inBooks'),
            },
            'bySection': const <Object?>[],
            'note': 'Form 26AS lists the TDS deductors reported against your PAN. Rows not in your books usually mean a customer paid you short by TDS and the shortfall was never recorded: record it with "TDS withheld" on that invoice. AIS is not read yet.',
          },
        };
      case 'tds_review':
        return {
          'ok': true,
          'data': {
            'period': 'Q3 2026-27',
            'periods': ['Q3 2026-27'],
            'month': 'Q3 2026-27',
            'draftHash': 'c' * 64,
            'empty': false,
            'changed': false,
            'steps': [
              {
                'id': 'deductees',
                'title': 'TDS deducted in Q3 2026-27',
                'lines': [
                  {'label': 'Rao & Co (AAAFR1234K), 194J, 1 payment of ₹60,000.00 at 10%', 'amount': 6000},
                  {'label': 'TDS deducted', 'amount': 6000, 'strong': true},
                ],
                'note': 'Every figure comes from the bills and expenses dated in this quarter.',
                'question': 'Is this information correct?',
                'yes': 'Yes, correct',
                'no': 'Something is wrong',
                'status': 'open',
                'waitingFor': null,
              },
              {
                'id': 'challans',
                'title': 'Challans for Q3 2026-27',
                'lines': [
                  {'label': 'Deposited for this quarter', 'amount': 6000 - tdsDue, 'strong': true},
                ],
                'note': 'Deposits are matched to deductions in date order.',
                'question': 'Is this information correct?',
                'yes': 'Yes, correct',
                'no': 'Something is wrong',
                'status': 'open',
                'waitingFor': 'deductees',
              },
              {
                'id': 'approve',
                'title': 'Approve the Q3 2026-27 TDS statement',
                'lines': [
                  {'label': 'TDS deducted', 'amount': 6000},
                ],
                'note': 'Approving records that you checked these figures; it files nothing.',
                'question': 'Approve these figures for the statement?',
                'yes': 'Approve',
                'no': 'Not yet',
                'status': 'open',
                'waitingFor': 'deductees',
              },
            ],
            'next': 'deductees',
            'approved': false,
            'approval': null,
          },
        };
      case 'tds_certificates':
        if (args['form'] == 'salary') {
          return {
            'ok': true,
            'data': {
              'form': '16',
              'fy': '2026-27',
              'certificates': [
                {'certificateNo': '16/2026-27/EMP-0001', 'employee': {'id': 'EMP-0001', 'name': 'Ravi Kumar', 'pan': 'ABCPK1234L', 'regime': 'new'}, 'partA': const <Object?>[], 'partB': {'grossSalary': 30000, 'taxOnTotalIncome': 0, 'tdsDeducted': 0}, 'notes': const <Object?>[]},
              ],
              'notes': const <Object?>[],
              'fileName': 'Form16_MUMA12345B_2026-27.csv',
              'csv': 'certificate_no,employee\n16/2026-27/EMP-0001,Ravi Kumar\n',
            },
          };
        }
        return {
          'ok': true,
          'data': {
            'form': '16A',
            'quarter': args['quarter'] ?? 'Q3 2026-27',
            'certificates': [
              {'certificateNo': '16A/Q3-2026-27/001', 'deductee': {'name': 'Rao & Co', 'pan': 'AAAFR1234K', 'noPan': false}, 'section': '194J', 'amountPaid': 60000, 'tdsDeducted': 6000, 'payments': const <Object?>[], 'challans': const <Object?>[], 'notes': const <Object?>[]},
            ],
            'notes': const <Object?>[],
            'fileName': 'Form16A_MUMA12345B_Q3-2026-27.csv',
            'csv': 'certificate_no,deductee\n16A/Q3-2026-27/001,Rao & Co\n',
          },
        };
      case 'salary_annexure':
        return {
          'ok': true,
          'data': {
            'fy': '2026-27',
            'form': '24Q Annexure II',
            'employees': 1,
            'rows': [
              {'employeeId': 'EMP-0001', 'name': 'Ravi Kumar', 'pan': 'ABCPK1234L', 'regime': 'new', 'monthsPaid': 1, 'grossSalary': 30000, 'professionalTax': 200, 'standardDeduction': 30000, 'providentFund80C': 0, 'totalIncome': 0, 'taxOnTotalIncome': 0, 'tdsDeducted': 0, 'shortfall': 0, 'excess': 0, 'noPan': false},
            ],
            'totals': {'grossSalary': 30000, 'professionalTax': 200, 'taxOnTotalIncome': 0, 'tdsDeducted': 0, 'shortfall': 0, 'excess': 0},
            'months': ['2026-10'],
            'unreviewed': true,
            'notes': const <Object?>[],
            'fileName': '24Q_AnnexureII_MUMA12345B_2026-27.csv',
            'csv': 'employee_id,name,pan\nEMP-0001,Ravi Kumar,ABCPK1234L\n',
          },
        };
      case 'pf_ecr':
        return {
          'ok': true,
          'data': {
            'period': args['period'],
            'month': 'October 2026',
            'members': 1,
            'totals': {'remittance': 4175},
            'missingUan': const <Object?>[],
            'fileName': 'ECR_27AAACN1234F1Z5_${args['period']}.txt',
            'text': '100200300400#~#RAVI KUMAR#~#30000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#0#~#0\n',
          },
        };
      case 'esi_return':
        return {'ok': false, 'error': 'NO_ESI_MEMBERS'};
      case 'payroll_payout_file':
        return {
          'ok': true,
          'data': {
            'period': args['period'],
            'month': 'October 2026',
            'employees': 1,
            'total': 27450,
            'paidOn': '',
            'missingBank': const <Object?>['Ravi Kumar'],
            'fileName': 'salary-payout-${args['period']}.csv',
            'csv': 'Beneficiary Name,Account Number,IFSC,Amount,Narration\nRavi Kumar,,,27450.00,SAL-${args['period']}\n',
          },
        };
      case 'payroll_run':
        if (country == 'US') {
          return {
            'ok': true,
            'data': {
              'country': 'US',
              'period': args['period'],
              'month': 'October 2026',
              'status': payrollApproved ? 'approved' : 'draft',
              'employees': 1,
              'rows': [
                {'employeeId': 'EMP-0001', 'name': 'Ravi Kumar', 'daysWorked': 31, 'daysInMonth': 31, 'gross': 5000, 'deductions': 782.5, 'net': 4217.5, 'notes': const <Object?>[]},
              ],
              'totals': {
                'gross': 5000, 'deductions': 782.5, 'net': 4217.5, 'employerContributions': 412.5, 'employerCost': 5412.5,
                'lines': [
                  {'name': 'Social Security (employees)', 'amount': 310},
                  {'name': 'Medicare (employees)', 'amount': 72.5},
                  {'name': 'Federal income tax withheld', 'amount': 400},
                ],
                'employerLines': [
                  {'name': 'Social Security (employer)', 'amount': 310},
                  {'name': 'Medicare (employer)', 'amount': 72.5},
                  {'name': 'Federal unemployment (FUTA)', 'amount': 30},
                ],
              },
              'notes': ['The FICA and FUTA rates and wage bases come from dated rules, which a US CPA has not reviewed yet.'],
              'draftHash': 'd' * 64,
              'approvedOn': payrollApproved ? '2026-10-05' : '',
              'paidOn': payrollPaid ? '2026-10-05' : '',
            },
          };
        }
        return {
          'ok': true,
          'data': {
            'period': args['period'],
            'month': 'October 2026',
            'status': payrollApproved ? 'approved' : 'draft',
            'employees': 1,
            'rows': [
              {'employeeId': 'EMP-0001', 'name': 'Ravi Kumar', 'daysWorked': 31, 'daysInMonth': 31, 'gross': 30000, 'deductions': 2000, 'net': 28000, 'notes': const <Object?>[]},
            ],
            'totals': {'gross': 30000, 'pfEmployee': 1800, 'esiEmployee': 0, 'pt': 200, 'tds': 0, 'deductions': 2000, 'net': 28000, 'employerContributions': 2375, 'employerCost': 32375},
            'notes': ['The contribution rates, limits and slabs come from the dated rules, which your CA has not reviewed yet.'],
            'draftHash': 'd' * 64,
            'approvedOn': payrollApproved ? '2026-10-05' : '',
            'paidOn': payrollPaid ? '2026-10-05' : '',
          },
        };
      case 'list_employees':
        final active = employees.where((e) => e['active'] == true);
        return {
          'ok': true,
          'data': {
            'employees': employees,
            'monthlyTotal': active.fold<num>(0, (sum, e) => sum + (e['monthly'] as num)),
            'note': 'Monthly pay before any deduction. Provident fund, state insurance, professional tax and TDS are not worked out yet.',
          },
        };
      case 'payment_run':
        return {
          'ok': true,
          'data': {
            'asOf': '2026-10-05',
            'windowDays': 14,
            'proposed': [
              {'billId': 'BILL-0001', 'supplier': 'Big Mills', 'supplierInvoiceNo': 'BM/3', 'outstanding': 8400, 'bucket': 'msme-limit', 'daysLeft': 1, 'daysToCredit': 160, 'age': 20},
              {'billId': 'BILL-0003', 'supplier': 'Old Trader', 'supplierInvoiceNo': '', 'outstanding': 6300, 'bucket': 'credit-at-risk', 'daysLeft': null, 'daysToCredit': 5, 'age': 175},
            ],
            'consider': <Map<String, Object?>>[],
            'later': [
              {'billId': 'BILL-0002', 'supplier': 'Big Mills', 'supplierInvoiceNo': 'BM/4', 'outstanding': 2100, 'bucket': 'later', 'daysLeft': 12, 'daysToCredit': 170, 'age': 10},
            ],
            'held': <Map<String, Object?>>[],
            'total': 14700,
            'considerTotal': 0,
            'laterTotal': 2100,
            'balance': 200000,
            'balanceSource': 'reading',
            'after': 185300,
            'verdict': 'yes',
          },
        };
      case 'collection_drafts':
        return {
          'ok': true,
          'data': {
            'asOf': '2026-10-05',
            'customers': [
              {
                'customer': args['customer'] ?? 'Retail Mart',
                'gstin': '',
                'score': 'new',
                'scoreWords': 'has not paid enough invoices yet to judge',
                'tone': 'neutral',
                'invoices': [
                  {'id': 'INV-0001', 'date': '2026-08-01', 'dueDate': '2026-08-31', 'daysLate': 40, 'outstanding': 5900},
                ],
                'total': 5900,
                'oldestDaysLate': 40,
                'message': 'Hello ${args['customer'] ?? 'Retail Mart'},\n\nThis is Asha Traders. This invoice is past due:\n• INV-0001 dated 1 August 2026, ₹5,900.00 (40 days past 31 August 2026)\n\nPlease pay ₹5,900.00 at your convenience, or let us know if anything on it needs correcting.\nThank you.',
                'lastSent': collectionReminders.isEmpty ? '' : '2026-10-05',
                'timesSent': collectionReminders.length,
              },
            ],
            'possiblyPaid': [],
            'total': 5900,
            'channel': 'whatsapp',
          },
        };
      case 'supplier_reminder_draft':
        return {
          'ok': true,
          'data': {
            'supplier': 'Gujarat Mills',
            'gstin': '24AAACF7856R1ZY',
            'period': args['period'],
            'bills': [
              {'billId': 'BILL-0002', 'supplierInvoiceNo': 'GM/77', 'reason': 'ITC_NOT_AVAILABLE'},
            ],
            'credit': 3600,
            'message': 'Hello Gujarat Mills,\n\nFor October 2026, this bill from you is not showing correctly for us:\n• Bill GM/77 dated 8 October 2026, ₹23,600.00: shown in our GSTR-2B with the credit marked not available',
            'lastSent': supplierReminders.isEmpty ? '' : '2026-10-05',
            'timesSent': supplierReminders.length,
          },
        };
      case 'list_filings':
        return {'ok': true, 'data': filings};
      case 'deadlines':
        return {
          'ok': true,
          'data': {
            'deadlines': [
              {
                'returnType': 'GSTR-1',
                'returnLabel': 'GSTR-1 (monthly)',
                'period': '2026-08',
                'dueDate': '2026-09-11',
                'daysUntil': -24,
                'level': 'overdue',
              },
              {
                'returnLabel': 'GSTR-1 (monthly)',
                'period': '2026-09',
                'dueDate': '2026-10-11',
                'daysUntil': 6,
                'level': 'due_soon',
              },
              {
                'returnLabel': 'GSTR-3B (monthly)',
                'period': '2026-09',
                'dueDate': '2026-10-20',
                'daysUntil': 15,
                'level': 'on_track',
              },
            ],
          },
        };
      case 'exceptions':
        return {
          'ok': true,
          'data': {
            'exceptions': [
              {
                'id': 'EXC-000003',
                'title': 'GSTR-1 for 2026-09 is due on 2026-10-11',
                'why': 'It is due on 2026-10-11, in 6 days.',
                'severity': 'medium',
                'moneyAtRisk': 0,
                'status': 'open',
              },
              {
                'id': 'EXC-000004',
                'title': 'GSTR-1 for 2026-08 is overdue',
                'why': 'It was due on 2026-09-11, 24 days ago.',
                'severity': 'high',
                'moneyAtRisk': 0,
                'status': 'open',
              },
              {
                'id': 'EXC-000001',
                'title': 'INV-0003 cannot be reported in GSTR-1',
                'why': 'The buyer GSTIN fails validation.',
                'severity': 'high',
                'moneyAtRisk': 590,
                'status': 'open',
              },
              {
                'id': 'EXC-000002',
                'title': 'Already handled',
                'why': 'Closed earlier.',
                'severity': 'high',
                'moneyAtRisk': 100,
                'status': 'resolved',
              },
            ],
          },
        };
    }
    return {'ok': false, 'error': 'UNKNOWN_TOOL'};
  }
}

Future<void> tapRow(WidgetTester tester, String title) async {
  final row = find.text(title);
  await tester.scrollUntilVisible(
    row,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.ensureVisible(row);
  await tester.pumpAndSettle();
  await tester.tap(row);
  await tester.pumpAndSettle();
}
