// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum LeaseSkipReason {
  @JsonValue('not_my_language')
  notMyLanguage('not_my_language'),
  @JsonValue('conflict_of_interest')
  conflictOfInterest('conflict_of_interest'),
  @JsonValue('not_my_topic')
  notMyTopic('not_my_topic'),
  @JsonValue('too_hard')
  tooHard('too_hard'),
  @JsonValue('other')
  other('other'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const LeaseSkipReason(this.json);

  factory LeaseSkipReason.fromJson(String json) =>
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
  static List<LeaseSkipReason> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
