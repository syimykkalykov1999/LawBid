// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// OQ-043: a case chat or a direct chat from a profile.
@JsonEnum()
enum ConversationKind {
  /// The name has been replaced because it contains a keyword. Original name: `case`.
  @JsonValue('case')
  valueCase('case'),
  @JsonValue('direct')
  direct('direct'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ConversationKind(this.json);

  factory ConversationKind.fromJson(String json) =>
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
  static List<ConversationKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
