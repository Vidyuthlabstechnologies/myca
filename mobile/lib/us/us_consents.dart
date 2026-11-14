import '../api/myca_api.dart';
import '../cloud/cloud_session.dart';

const usPartnerTinsConsent = 'us-7216-partner-tins';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

class UsConsentForm {
  const UsConsentForm({required this.document, required this.version, required this.title, required this.text, this.kind = '', this.ready = true, this.signedAt = '', this.validUntil = ''});

  factory UsConsentForm.fromJson(Object? json) {
    final map = _map(json);
    final signed = _map(map['signed']);
    return UsConsentForm(
      document: '${map['document'] ?? ''}',
      version: '${map['version'] ?? ''}',
      title: '${map['title'] ?? ''}',
      text: '${map['text'] ?? ''}',
      kind: '${map['kind'] ?? ''}',
      ready: map['final'] != false,
      signedAt: '${signed['signedAt'] ?? ''}',
      validUntil: '${signed['validUntil'] ?? ''}',
    );
  }

  final String document;
  final String version;
  final String title;
  final String text;
  final String kind;
  final bool ready;
  final String signedAt;
  final String validUntil;

  bool get signed => signedAt.isNotEmpty;
}

abstract class UsConsents {
  Future<List<UsConsentForm>> list();
  Future<void> sign(UsConsentForm form, {required String signedName, required String validUntil});
  Future<void> revoke(String document);
}

class CloudUsConsents implements UsConsents {
  CloudUsConsents(this.cloud);

  final CloudSession cloud;

  @override
  Future<List<UsConsentForm>> list() async {
    final body = await cloud.usConsents();
    final rows = body['consents'];
    return [if (rows is List) for (final row in rows) UsConsentForm.fromJson(row)];
  }

  @override
  Future<void> sign(UsConsentForm form, {required String signedName, required String validUntil}) =>
      cloud.signUsConsent({'document': form.document, 'version': form.version, 'signedName': signedName, 'validUntil': validUntil});

  @override
  Future<void> revoke(String document) => cloud.revokeUsConsent(document);
}

Future<UsConsentForm?> consentFor(UsConsents consents, String document) async {
  try {
    for (final form in await consents.list()) {
      if (form.document == document) return form;
    }
  } on MycaApiException {
    return null;
  }
  return null;
}
