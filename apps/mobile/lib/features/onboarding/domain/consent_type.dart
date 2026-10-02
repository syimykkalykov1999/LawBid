/// `ConsentType` values the onboarding consents step (docs/01_FOUNDATION_
/// AUTH.md §10.2 H) sends to `POST /users/me/consents`. Wire names are the
/// Prisma enum's (apps/api/prisma/schema.prisma `enum ConsentType`).
enum ConsentType {
  age18('age_18', required: true),
  terms('terms', required: true),
  privacy('privacy', required: true),
  disclaimer('disclaimer', required: true),
  marketingEmail('marketing_email', required: false),
  marketingPush('marketing_push', required: false),
  analytics('analytics', required: false);

  const ConsentType(this.wireName, {required this.required});

  final String wireName;

  /// The server's `REQUIRED_CONSENTS` (onboarding.service.ts): without
  /// these `missing` keeps `consents` and the guard holds the user here.
  final bool required;

  static List<ConsentType> get requiredTypes =>
      values.where((c) => c.required).toList(growable: false);
}

/// One `{type, granted, documentId?}` item of the consents request.
class ConsentDecision {
  const ConsentDecision({
    required this.type,
    required this.granted,
    this.documentId,
  });

  final ConsentType type;
  final bool granted;

  /// `legal_documents.id` of the accepted version, when known. The
  /// `/config/bootstrap` payload does not expose document ids yet (see
  /// docs/CHANGELOG.md stage 1.7 mobile), so this is usually null.
  final String? documentId;

  Map<String, dynamic> toJson() => {
        'type': type.wireName,
        'granted': granted,
        if (documentId != null) 'documentId': documentId,
      };
}
