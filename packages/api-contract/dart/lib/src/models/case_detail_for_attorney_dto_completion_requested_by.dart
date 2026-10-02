// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Owner 2026-10-02: who marked "Done" first while the case waits for the other side (null otherwise).
@JsonEnum()
enum CaseDetailForAttorneyDtoCompletionRequestedBy {
  @JsonValue('client')
  client('client'),
  @JsonValue('attorney')
  attorney('attorney'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const CaseDetailForAttorneyDtoCompletionRequestedBy(this.json);

  factory CaseDetailForAttorneyDtoCompletionRequestedBy.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to String. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<CaseDetailForAttorneyDtoCompletionRequestedBy>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
