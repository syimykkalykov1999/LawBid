import 'package:flutter/foundation.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';

/// Owner 2026-10-05 — demo mode («Продвижение», docs/ops/demo-world.md):
/// throw-away accounts in a separate demo database that partners and
/// bloggers use to record videos. Nothing in them is real.
enum DemoRole {
  client('client'),
  attorney('attorney'),
  assistant('assistant');

  const DemoRole(this.wire);
  final String wire;

  static DemoRole parse(String? v) => DemoRole.values.firstWhere(
        (r) => r.wire == v,
        orElse: () => DemoRole.client,
      );
}

/// `DemoAccountDto`.
@immutable
class DemoAccount {
  const DemoAccount({
    required this.id,
    required this.role,
    required this.displayName,
    required this.createdAt,
    required this.lastSeenAt,
    required this.expiresAt,
  });

  factory DemoAccount.fromJson(Map<String, dynamic> json) => DemoAccount(
        id: json['id'] as String,
        role: DemoRole.parse(json['role'] as String?),
        displayName: (json['displayName'] as String?)?.trim() ?? '',
        createdAt: _date(json['createdAt']) ?? DateTime.now(),
        lastSeenAt: _date(json['lastSeenAt']),
        expiresAt: _date(json['expiresAt']) ?? DateTime.now(),
      );

  /// Registry id (real DB) — what `/demo/accounts/:id/*` takes.
  final String id;
  final DemoRole role;
  final String displayName;
  final DateTime createdAt;
  final DateTime? lastSeenAt;
  final DateTime expiresAt;
}

/// `DemoMeDto` — the partner's demo dashboard. Non-partners get
/// `enabled: false` (200, never 403).
@immutable
class DemoMe {
  const DemoMe({
    required this.enabled,
    required this.canCreate,
    required this.maxAccounts,
    required this.ttlDays,
    required this.accounts,
  });

  factory DemoMe.fromJson(Map<String, dynamic> json) => DemoMe(
        enabled: json['enabled'] == true,
        canCreate: json['canCreate'] == true,
        maxAccounts: (json['maxAccounts'] as num?)?.toInt() ?? 0,
        ttlDays: (json['ttlDays'] as num?)?.toInt() ?? 0,
        accounts: [
          for (final a in (json['accounts'] as List<dynamic>? ?? const []))
            if (a is Map<String, dynamic>) DemoAccount.fromJson(a),
        ],
      );

  /// Master switch on AND this user is an active partner with demo right.
  final bool enabled;
  final bool canCreate;
  final int maxAccounts;

  /// Auto-delete after this many idle days.
  final int ttlDays;
  final List<DemoAccount> accounts;
}

/// `DemoSessionDto` — a demo account plus the tokens of a demo session
/// (same shape as `/auth/otp/verify`; the access token carries `demo: true`).
@immutable
class DemoSession {
  const DemoSession({required this.account, required this.tokens});

  factory DemoSession.fromJson(Map<String, dynamic> json) {
    final tokens = json['tokens'] as Map<String, dynamic>? ?? const {};
    return DemoSession(
      account: DemoAccount.fromJson(json['account'] as Map<String, dynamic>),
      tokens: AuthTokensResult(
        accessToken: tokens['accessToken'] as String,
        refreshToken: tokens['refreshToken'] as String,
        accessTokenExpiresIn:
            (tokens['accessTokenExpiresIn'] as num?)?.toInt() ?? 900,
        // Not part of DemoSessionDto; a demo sign-in is never onboarding.
        isNewUser: tokens['isNewUser'] == true,
      ),
    );
  }

  final DemoAccount account;
  final AuthTokensResult tokens;
}

DateTime? _date(Object? v) =>
    v is String ? DateTime.tryParse(v)?.toLocal() : null;
