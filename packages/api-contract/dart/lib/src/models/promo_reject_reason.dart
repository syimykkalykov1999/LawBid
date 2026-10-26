// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Why the code cannot be used (valid = false).
@JsonEnum()
enum PromoRejectReason {
  @JsonValue('not_found')
  notFound('not_found'),
  @JsonValue('inactive')
  inactive('inactive'),
  @JsonValue('not_started')
  notStarted('not_started'),
  @JsonValue('expired')
  expired('expired'),
  @JsonValue('exhausted')
  exhausted('exhausted'),
  @JsonValue('wrong_audience')
  wrongAudience('wrong_audience'),
  @JsonValue('wrong_plan')
  wrongPlan('wrong_plan'),
  @JsonValue('already_used')
  alreadyUsed('already_used'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const PromoRejectReason(this.json);

  factory PromoRejectReason.fromJson(String json) =>
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
  static List<PromoRejectReason> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
