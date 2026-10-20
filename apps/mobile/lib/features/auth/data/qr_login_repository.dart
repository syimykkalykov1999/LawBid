import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';

/// A sign-in QR code the website shows.
class WebLoginCode {
  const WebLoginCode({
    required this.qrId,
    required this.pollSecret,
    required this.url,
    required this.expiresIn,
  });

  final String qrId;

  /// Kept by this browser only; never part of the QR.
  final String pollSecret;

  /// What the QR encodes.
  final String url;
  final Duration expiresIn;
}

/// Where the website's wait for the phone stands.
enum WebLoginStatus { pending, scanned, approved, rejected, expired }

/// What the phone shows before "Sign in on the web?".
class WebLoginPreview {
  const WebLoginPreview({
    required this.deviceName,
    required this.userAgent,
    required this.ipHint,
    required this.createdAt,
    required this.expiresIn,
  });

  final String? deviceName;
  final String? userAgent;
  final String? ipHint;
  final DateTime createdAt;
  final Duration expiresIn;
}

/// Owner 2026-10-20: both halves of "sign in to the website by QR" — the
/// website asks for a code and waits ([createCode], [poll]); the signed-in
/// phone scans it, looks at the browser and answers ([preview], [answer]).
class QrLoginRepository {
  QrLoginRepository(this._client, this._session);

  final AuthApiClient _client;
  final SessionController _session;

  Future<WebLoginCode> createCode() async {
    final r = await _client.qrCreate();
    return WebLoginCode(
      qrId: r.qrId,
      pollSecret: r.pollSecret,
      url: r.qrUrl,
      expiresIn: Duration(seconds: r.expiresIn),
    );
  }

  /// One poll. When the phone approved, the tokens arrive once and the
  /// session starts here (the router guard then leaves the sign-in screens).
  Future<WebLoginStatus> poll(WebLoginCode code) async {
    final r = await _client.qrPoll(
      qrId: code.qrId,
      pollSecret: code.pollSecret,
    );
    switch (r.status.json) {
      case 'approved':
        final access = r.accessToken;
        final refresh = r.refreshToken;
        if (access == null || refresh == null) return WebLoginStatus.expired;
        await _session.applyTokens(
          AuthTokensResult(
            accessToken: access,
            refreshToken: refresh,
            accessTokenExpiresIn: r.accessTokenExpiresIn ?? 900,
            isNewUser: false,
          ),
        );
        return WebLoginStatus.approved;
      case 'scanned':
        return WebLoginStatus.scanned;
      case 'rejected':
        return WebLoginStatus.rejected;
      case 'pending':
        return WebLoginStatus.pending;
      default:
        return WebLoginStatus.expired;
    }
  }

  Future<WebLoginPreview> preview(String qrId) async {
    final r = await _client.qrPreview(qrId);
    return WebLoginPreview(
      deviceName: r.deviceName,
      userAgent: r.userAgent,
      ipHint: r.ipHint,
      createdAt: r.createdAt,
      expiresIn: Duration(seconds: r.expiresIn),
    );
  }

  Future<void> answer(String qrId, {required bool approve}) =>
      _client.qrAnswer(qrId, approve: approve);
}
