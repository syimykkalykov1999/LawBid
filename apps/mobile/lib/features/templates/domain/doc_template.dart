import 'package:flutter/foundation.dart';

/// Owner 2026-10-05: one document template from the library (admin →
/// Content → Document templates).
class DocTemplate {
  const DocTemplate({
    required this.id,
    required this.title,
    required this.description,
    required this.fileName,
    required this.mime,
    required this.sizeBytes,
    required this.language,
    required this.lawyersOnly,
    required this.downloadCount,
    this.locked = false,
    this.practiceKey,
    this.practiceName,
    this.state,
  });

  final String id;
  final String title;
  final String description;
  final String fileName;
  final String mime;
  final int sizeBytes;

  /// i18n key of the practice area (null = any practice).
  final String? practiceKey;

  /// English name of the practice (when the key has no translation).
  final String? practiceName;

  /// Two-letter state (null = every state).
  final String? state;
  final String language;
  final bool lawyersOnly;
  final int downloadCount;

  /// Owner 2026-10-05 (plan builder): the user's plan does not include
  /// templates — browsing works, downloading and attaching open the plans.
  final bool locked;

  bool get isPdf => mime == 'application/pdf';
}

/// What the list shows: search text, a state (every-state templates are
/// always included) and the order.
@immutable
class TemplatesQuery {
  const TemplatesQuery({this.q = '', this.state, this.newest = false});

  final String q;
  final String? state;
  final bool newest;

  TemplatesQuery copyWith({String? q, String? state, bool? newest}) =>
      TemplatesQuery(
        q: q ?? this.q,
        state: state ?? this.state,
        newest: newest ?? this.newest,
      );

  TemplatesQuery withoutState() => TemplatesQuery(q: q, newest: newest);

  @override
  bool operator ==(Object other) =>
      other is TemplatesQuery &&
      other.q == q &&
      other.state == state &&
      other.newest == newest;

  @override
  int get hashCode => Object.hash(q, state, newest);
}

/// Where a one-tap copy of a template goes.
enum TemplateTarget { chat, kase }
