import 'package:flutter/foundation.dart';

/// Owner 2026-10-05 (legal documents) — the legal texts the owner edits in
/// the admin (Система → Юридические документы): the list of current
/// versions, the text of one, and the documents the signed-in user still
/// has to accept.

/// Order the documents are listed in (Settings → About, the acceptance
/// screen): the main agreements first.
const kLegalDocOrder = <String>[
  'terms',
  'privacy',
  'attorney_agreement',
  'client_agreement',
  'eula',
  'disclaimer',
  'client_contact_sharing',
  'refund',
  'cookies',
  'third_party_services',
  'partner_terms',
  'dmca_policy',
];

/// Position of [docType] in [kLegalDocOrder]; unknown types go last.
int legalDocRank(String docType) {
  final i = kLegalDocOrder.indexOf(docType);
  return i < 0 ? kLegalDocOrder.length : i;
}

/// One current document without its text (`GET /legal/documents`).
@immutable
class LegalDocumentBrief {
  const LegalDocumentBrief({
    required this.docType,
    required this.locale,
    required this.version,
    required this.title,
    this.publishedAt,
  });

  final String docType;
  final String locale;
  final String version;

  /// Already in the document's language.
  final String title;
  final DateTime? publishedAt;
}

/// The current text of one document (`GET /legal/documents/:type`).
@immutable
class LegalDocumentText {
  const LegalDocumentText({
    required this.docType,
    required this.locale,
    required this.version,
    required this.title,
    required this.contentMd,
    this.publishedAt,
  });

  final String docType;
  final String locale;
  final String version;
  final String title;

  /// Markdown.
  final String contentMd;
  final DateTime? publishedAt;
}

/// A document of the user's role not yet accepted at its current version
/// (`pendingLegalDocuments` of `GET /users/me`, `GET /legal/pending`).
@immutable
class PendingLegalDocument {
  const PendingLegalDocument({
    required this.id,
    required this.docType,
    required this.version,
    required this.title,
    this.updated = false,
  });

  static PendingLegalDocument? tryParse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final id = raw['id'];
    final type = raw['docType'];
    final version = raw['version'];
    if (id is! String || type is! String || version is! String) return null;
    return PendingLegalDocument(
      id: id,
      docType: type,
      version: version,
      title: raw['title'] as String? ?? '',
      updated: raw['reason'] == 'updated',
    );
  }

  /// `legal_documents.id` of the version to accept.
  final String id;
  final String docType;
  final String version;

  /// In the document's language; empty when unknown (the app then uses
  /// its own `legal.doc.<type>` string).
  final String title;

  /// `true` — a material change to something accepted before; `false` —
  /// never accepted.
  final bool updated;

  @override
  bool operator ==(Object other) =>
      other is PendingLegalDocument &&
      other.id == id &&
      other.docType == docType &&
      other.version == version &&
      other.updated == updated;

  @override
  int get hashCode => Object.hash(id, docType, version, updated);
}
