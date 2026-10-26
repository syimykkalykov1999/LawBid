/// Phones (and tests on the VM): there is no Turnstile; App Check protects
/// the app (core/security/app_check.dart). Never asked for a token.
Future<String?> runTurnstile(String siteKey) async => null;
