class AppConfig {
  const AppConfig({
    required this.baseUrl,
    required this.clientToken,
    this.cloudUrl = '',
    this.googleServerClientId = '',
    this.oidcClientId = '',
  });

  static const fromEnvironment = AppConfig(
    baseUrl: String.fromEnvironment(
      'MYCA_API_URL',
      defaultValue: 'http://127.0.0.1:4780',
    ),
    clientToken: String.fromEnvironment('MYCA_API_TOKEN'),
    cloudUrl: String.fromEnvironment('MYCA_CLOUD_URL'),
    googleServerClientId: String.fromEnvironment('MYCA_GOOGLE_SERVER_CLIENT_ID'),
    oidcClientId: String.fromEnvironment('MYCA_OIDC_CLIENT_ID'),
  );

  final String baseUrl;
  final String clientToken;
  final String cloudUrl;
  final String googleServerClientId;
  final String oidcClientId;

  bool get hosted => cloudUrl.isNotEmpty;
}

String editionFor(String? flavor, {String defined = const String.fromEnvironment('MYCA_EDITION')}) {
  final pick = (defined.isNotEmpty ? defined : flavor ?? '').toUpperCase();
  if (pick == 'GB' || pick == 'UK') return 'GB';
  if (pick == 'AE' || pick == 'UAE') return 'AE';
  return pick == 'US' ? 'US' : 'IN';
}
