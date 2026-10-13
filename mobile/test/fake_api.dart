import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';

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

class FakeMycaApi implements MycaApi {
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
  num tdsDue = 6000;
  final tdsDeposits = <Map<String, Object?>>[];
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

  static const _user = {
    'userId': 'USR-ADMIN',
    'name': 'Firm Admin',
    'role': 'admin',
    'locked': false,
  };

  @override
  Future<Snapshot> snapshot() async => Snapshot.fromJson({
    'company': {'name': companyName, 'gstin': country == 'US' ? '' : '27AABCU9603R1ZN', 'tdsDeductor': tdsDeductor, 'country': country},
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
      return _preview(
        'Quote to ${args['partyName']}: total ₹59,000.00. Valid until 2026-11-04.',
      );
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
    if (name == 'record_supplier_reminder') {
      return _preview('Send a reminder to Gujarat Mills about 1 bill for ${args['period']}, with ₹3,600.00 of your input credit waiting on them.');
    }
    if (name == 'record_filing') {
      return _preview('Record GSTR-1 (monthly) for ${args['period']} as filed on ${args['filedOn']}, ARN ${args['arn']}. It was due on 2026-09-11. That is after the due date.');
    }
    if (name == 'ask_ca') {
      return _preview(
        'Ask your CA about ${(args['subject'] as Map)['id'] ?? (args['subject'] as Map)['period']}: "${args['note']}"',
      );
    }
    if (name == 'reply_ca' || name == 'close_ca') {
      return _preview('$name ${args['id']}');
    }
    if (name == 'set_payment_terms') {
      return _preview('${args['partyName']}: Net ${args['days']}.');
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
    return _preview(switch (name) {
      'create_invoice' => 'Invoice to ${args['partyName']}: total ₹9,440.00.',
      'record_receipt' => 'Receipt of ₹1,000.00 against ${args['invoiceId']}.',
      'record_payment' =>
        'Pay Fabric Co ₹${args['amount']} against ${args['billId']} from the ${args['mode']}.',
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
      if (held.tool == 'end_employment') {
        final e = employees.firstWhere((e) => e['id'] == held.args['id']);
        e['leftOn'] = held.args['leftOn'];
        e['active'] = false;
        return ChatReply.fromJson({'reply': 'Recorded that ${e['name']} left on ${held.args['leftOn']}.', 'posted': true, 'confirmed': true});
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
    switch (name) {
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
      case 'gst_payable':
        return {'ok': true, 'data': {'period': args['period'], 'toPay': {'igst': 0, 'cgst': 1800, 'sgst': 1800, 'total': 3600}, 'notes': const <Object?>[]}};
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
