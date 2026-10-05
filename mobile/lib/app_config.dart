class AppConfig {
  const AppConfig({
    required this.baseUrl,
    required this.clientToken,
    this.cloudUrl = '',
  });

  static const fromEnvironment = AppConfig(
    baseUrl: String.fromEnvironment(
      'MYCA_API_URL',
      defaultValue: 'http://127.0.0.1:4780',
    ),
    clientToken: String.fromEnvironment('MYCA_API_TOKEN'),
    cloudUrl: String.fromEnvironment('MYCA_CLOUD_URL'),
  );

  final String baseUrl;
  final String clientToken;
  final String cloudUrl;

  bool get hosted => cloudUrl.isNotEmpty;
}
