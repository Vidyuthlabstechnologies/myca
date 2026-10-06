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
    'company': {'name': companyName, 'gstin': '27AABCU9603R1ZN'},
    'invoices': invoices,
    'purchases': purchases,
    'expenses': expenses,
    'creditNotes': creditNotes,
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
      'reply': 'Discarded. Nothing was posted.',
      'posted': false,
    });
  }

  @override
  Future<ChatReply> chat(String message) async {
    sent.add(message);
    return ChatReply.fromJson({
      'reply': 'GST output ₹82,690.00 − input ₹2,000.00 = payable ₹80,690.00.',
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
      case 'invoice_document':
        if (args['id'] != 'INV-0002') {
          return {'ok': false, 'error': 'INVOICE_NOT_FOUND'};
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
            'buyer': {'name': 'Gujarat Weaves', 'gstin': '24AAACG1234F1Z5'},
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
            'status': invoices[1]['status'],
            'balance':
                277600 -
                creditNotes.fold<num>(0, (sum, n) => sum + (n['total'] as num)),
            'missing': ['HSN'],
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
            },
            'previous': {
              'sales': {'count': 2, 'total': 902600, 'net': 902600},
              'creditNotes': {'count': 0, 'total': 0},
              'purchases': {'count': 0, 'total': 0},
              'expenses': {'count': 1, 'total': 12000},
            },
            'owedToYou': {
              'total': 377600,
              'invoices': 1,
              'customers': [
                {'name': 'Gujarat Weaves', 'due': 377600, 'invoices': 1},
              ],
            },
            'caveat':
                'Purchases are bill totals; what you still owe suppliers is not tracked yet.',
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
      case 'deadlines':
        return {
          'ok': true,
          'data': {
            'deadlines': [
              {
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
  await tester.ensureVisible(row);
  await tester.pumpAndSettle();
  await tester.tap(row);
  await tester.pumpAndSettle();
}
