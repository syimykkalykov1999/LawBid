/// One entry of `/config/bootstrap`'s `legal_documents` (apps/api
/// bootstrap.service.ts: `doc_type, version, locale, content_url,
/// content_md, published_at`). Read by the consents step (docs/01_
/// FOUNDATION_AUTH.md §10.2 H) to link Terms/Privacy/Disclaimer.
class LegalDocument {
  const LegalDocument({
    required this.docType,
    required this.version,
    required this.locale,
    this.contentUrl,
    this.contentMd,
  });

  static LegalDocument? tryParse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final type = raw['doc_type'];
    final version = raw['version'];
    final locale = raw['locale'];
    if (type is! String || version is! String || locale is! String) return null;
    return LegalDocument(
      docType: type,
      version: version,
      locale: locale,
      contentUrl: raw['content_url'] as String?,
      contentMd: raw['content_md'] as String?,
    );
  }

  /// `terms` | `privacy` | `disclaimer` | `client_contact_sharing`.
  final String docType;
  final String version;
  final String locale;
  final String? contentUrl;
  final String? contentMd;
}

/// Picks [docType] in [locale], falling back to English, then to any
/// locale — the seed only ships `en` today (docs/02 §3.3).
LegalDocument? pickLegalDocument(
  List<LegalDocument> docs,
  String docType,
  String locale,
) {
  LegalDocument? fallback;
  LegalDocument? english;
  for (final doc in docs) {
    if (doc.docType != docType) continue;
    if (doc.locale == locale) return doc;
    if (doc.locale == 'en') english = doc;
    fallback ??= doc;
  }
  return english ?? fallback;
}
