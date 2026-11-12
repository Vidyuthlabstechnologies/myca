part of '../models.dart';

class Company {
  const Company({required this.name, required this.gstin, this.tdsDeductor = false, this.country = 'IN', this.gstFrequency = 'monthly', this.entityType = ''});

  factory Company.fromJson(Object? json) {
    final map = _map(json);
    return Company(
      name: _text(map['name']),
      gstin: _text(map['gstin']),
      tdsDeductor: map['tdsDeductor'] == true,
      country: _text(map['country']).isEmpty ? 'IN' : _text(map['country']).toUpperCase(),
      gstFrequency: _text(map['gstFrequency']).toLowerCase() == 'quarterly' ? 'quarterly' : 'monthly',
      entityType: _text(map['entityType']).toLowerCase(),
    );
  }

  final String entityType;

  bool get household => country == 'US' && entityType == 'household';
  final String name;
  final String gstin;
  final String country;
  final String gstFrequency;

  bool get quarterlyGst => gstFrequency == 'quarterly';
  final bool tdsDeductor;
}

class FirmUser {
  const FirmUser({
    required this.userId,
    required this.name,
    required this.role,
    required this.locked,
  });

  factory FirmUser.fromJson(Object? json) {
    final map = _map(json);
    return FirmUser(
      userId: _text(map['userId']),
      name: _text(map['name']),
      role: _text(map['role']),
      locked: map['locked'] == true,
    );
  }

  final String userId;
  final String name;
  final String role;
  final bool locked;
}

class Snapshot {
  const Snapshot({
    required this.company,
    required this.invoices,
    required this.purchases,
    required this.expenses,
    required this.creditNotes,
    this.customerTerms = const {},
    this.quotes = const [],
    required this.users,
    required this.activeUser,
    this.sharedAsOf = '',
  });

  factory Snapshot.fromJson(Object? json) {
    final map = _map(json);
    final active = map['activeUser'];
    return Snapshot(
      company: Company.fromJson(map['company']),
      invoices: _maps(map['invoices']).map(Invoice.fromJson).toList(),
      purchases: _maps(map['purchases']).map(Invoice.fromJson).toList(),
      expenses: _maps(map['expenses']).map(Expense.fromJson).toList(),
      creditNotes: _maps(map['creditNotes']).map(CreditNote.fromJson).toList(),
      quotes: _maps(map['quotes']).map(Quote.fromJson).toList(),
      customerTerms: {
        for (final entry in _map(map['customerTerms']).entries)
          if (entry.value is num) entry.key: (entry.value as num).toInt(),
      },
      users: _maps(map['users']).map(FirmUser.fromJson).toList(),
      activeUser: active is Map ? FirmUser.fromJson(active) : null,
      sharedAsOf: _text(map['sharedAsOf']),
    );
  }

  final String sharedAsOf;
  final Company company;
  final List<Invoice> invoices;
  final List<Invoice> purchases;
  final List<Expense> expenses;
  final List<CreditNote> creditNotes;
  final Map<String, int> customerTerms;
  final List<Quote> quotes;
  final List<FirmUser> users;

  int? termsFor(String name, String gstin) {
    final tax = gstin.trim().toUpperCase();
    if (tax.isNotEmpty && customerTerms.containsKey('gstin:$tax')) {
      return customerTerms['gstin:$tax'];
    }
    return customerTerms['name:${name.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ')}'];
  }

  final FirmUser? activeUser;
}

class SignInResult {
  const SignInResult({required this.ok, required this.error});

  factory SignInResult.fromJson(Object? json) {
    final map = _map(json);
    return SignInResult(ok: map['ok'] == true, error: _text(map['error']));
  }

  final bool ok;
  final String error;
}

class ChatPreview {
  const ChatPreview({
    required this.token,
    required this.summary,
    required this.effects,
    this.figures = const <String, dynamic>{},
  });

  factory ChatPreview.fromJson(Object? json) {
    final map = _map(json);
    final effects = map['effects'];
    return ChatPreview(
      token: _text(map['token']),
      summary: _text(map['summary']),
      effects: effects is List ? effects.map(_text).toList() : const <String>[],
      figures: _map(map['figures']),
    );
  }

  final String token;
  final String summary;
  final List<String> effects;
  final Map<String, dynamic> figures;

  String get headName => _text(figures['headName']);
  String get head => _text(figures['head']);
}

class ChatReply {
  const ChatReply({
    required this.reply,
    required this.preview,
    required this.posted,
    required this.blocked,
  });

  factory ChatReply.fromJson(Object? json) {
    final map = _map(json);
    final awaiting =
        map['awaitingConfirmation'] == true && map['preview'] is Map;
    return ChatReply(
      reply: _text(map['reply']),
      preview: awaiting ? ChatPreview.fromJson(map['preview']) : null,
      posted: map['posted'] == true,
      blocked: map['blocked'] == true,
    );
  }

  final String reply;
  final ChatPreview? preview;
  final bool posted;
  final bool blocked;
}

class Today {
  const Today({
    required this.gst,
    required this.deadlines,
    required this.exceptions,
    this.summary,
    this.reminders = const [],
  });

  final PeriodGst? gst;
  final List<Deadline> deadlines;
  final List<ExceptionItem> exceptions;
  final BusinessSummary? summary;
  final List<Reminder> reminders;
}

class ToolOutcome {
  const ToolOutcome({required this.ok, required this.error});

  factory ToolOutcome.fromJson(Object? json) {
    final map = _map(json);
    return ToolOutcome(ok: map['ok'] != false, error: _text(map['error']));
  }

  final bool ok;
  final String error;
}

class Place {
  const Place({required this.code, required this.name});

  factory Place.fromJson(Object? json) {
    final map = _map(json);
    return Place(code: _text(map['code']), name: _text(map['name']));
  }

  final String code;
  final String name;

  String get label =>
      name.isEmpty ? code : (code.isEmpty ? name : '$name ($code)');
}
