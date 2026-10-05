// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum FraudEventKind {
  @JsonValue('linked_match')
  linkedMatch('linked_match'),
  @JsonValue('sign_in_blocked')
  signInBlocked('sign_in_blocked'),
  @JsonValue('auto_review')
  autoReview('auto_review'),
  @JsonValue('auto_restricted')
  autoRestricted('auto_restricted'),
  @JsonValue('auto_banned')
  autoBanned('auto_banned'),
  @JsonValue('staff_cleared')
  staffCleared('staff_cleared'),
  @JsonValue('staff_restricted')
  staffRestricted('staff_restricted'),
  @JsonValue('staff_banned')
  staffBanned('staff_banned'),
  @JsonValue('staff_unbanned')
  staffUnbanned('staff_unbanned'),
  @JsonValue('linked_banned')
  linkedBanned('linked_banned'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const FraudEventKind(this.json);

  factory FraudEventKind.fromJson(String json) =>
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
  static List<FraudEventKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
