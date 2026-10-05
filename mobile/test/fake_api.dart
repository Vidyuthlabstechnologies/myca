import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';

class MemoryOnboardingStore implements OnboardingStore {
  MemoryOnboardingStore({this.isWelcomed = false, this.isMigrated = false});

  bool isWelcomed;
  bool isMigrated;

  @override
  Future<bool> welcomed() async => isWelcomed;

  @override
  Future<void> markWelcomed() async => isWelcomed = true;

  @override
  Future<bool> migrated() async => isMigrated;

  @override
  Future<void> markMigrated() async => isMigrated = true;
}

AppState testState(FakeMycaApi api, {bool onboarded = true, PickTextFile? pick}) => AppState(
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
  FakeMycaApi({this.signedIn = false, this.pin = '4321', bool emptyBooks = false}) {
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

  final purchases = <Map<String, Object?>>[
    {'id': 'BILL-0001', 'date': '2026-08-06', 'partyName': 'Fabric Co', 'partyGstin': '27AABCT1332L1ZE', 'total': 42000, 'status': 'posted'},
  ];

  static const _user = {'userId': 'USR-ADMIN', 'name': 'Firm Admin', 'role': 'admin', 'locked': false};

  @override
  Future<Snapshot> snapshot() async => Snapshot.fromJson({
        'company': {'name': companyName, 'gstin': '27AABCU9603R1ZN'},
        'invoices': invoices,
        'purchases': purchases,
        'users': [_user],
        'activeUser': signedIn ? _user : null,
      });

  @override
  Future<SignInResult> signIn(String userId, String pin) async {
    if (pin != this.pin) return const SignInResult(ok: false, error: 'INVALID_PIN');
    signedIn = true;
    return const SignInResult(ok: true, error: '');
  }

  @override
  Future<void> signOut() async {
    signedIn = false;
  }

  ChatReply _preview(String summary) => ChatReply.fromJson({
        'reply': summary,
        'posted': false,
        'awaitingConfirmation': true,
        'preview': {
          'token': token,
          'summary': summary,
          'effects': ['The books change only after you confirm.'],
        },
      });

  final uploads = <String, String>{};

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
      return ChatReply.fromJson({'reply': 'I did not post anything, because:\n· GST rate is not valid.', 'posted': false, 'blocked': true});
    }
    _held = proposal;
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
        return ChatReply.fromJson({'reply': 'Posted INV-0003 to ${held.args['partyName']} for ₹9,440.00.', 'posted': true, 'confirmed': true});
      }
      return ChatReply.fromJson({'reply': 'Done: ${held.tool}.', 'posted': true, 'confirmed': true});
    }
    return ChatReply.fromJson({'reply': 'There is nothing waiting to be posted.', 'posted': false});
  }

  @override
  Future<ChatReply> discard() async {
    discards += 1;
    _held = null;
    return ChatReply.fromJson({'reply': 'Discarded. Nothing was posted.', 'posted': false});
  }

  @override
  Future<ChatReply> chat(String message) async {
    sent.add(message);
    return ChatReply.fromJson({'reply': 'GST output ₹82,690.00 − input ₹2,000.00 = payable ₹80,690.00.'});
  }

  @override
  Future<ToolOutcome> updateCompany({required String name, String gstin = ''}) async {
    companyUpdates.add({'name': name, 'gstin': gstin});
    companyName = name;
    return const ToolOutcome(ok: true, error: '');
  }

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    queries.add(name);
    switch (name) {
      case 'gst_payable':
        return {
          'ok': true,
          'data': {'output': 82690, 'input': 2000, 'payable': 80690},
        };
      case 'deadlines':
        return {
          'ok': true,
          'data': {
            'deadlines': [
              {'returnLabel': 'GSTR-1 (monthly)', 'period': '2026-08', 'dueDate': '2026-09-11', 'daysUntil': -24, 'level': 'overdue'},
              {'returnLabel': 'GSTR-1 (monthly)', 'period': '2026-09', 'dueDate': '2026-10-11', 'daysUntil': 6, 'level': 'due_soon'},
              {'returnLabel': 'GSTR-3B (monthly)', 'period': '2026-09', 'dueDate': '2026-10-20', 'daysUntil': 15, 'level': 'on_track'},
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
