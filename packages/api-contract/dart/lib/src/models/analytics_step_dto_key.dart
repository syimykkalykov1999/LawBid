// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum AnalyticsStepDtoKey {
  @JsonValue('signed_up')
  signedUp('signed_up'),
  @JsonValue('verified')
  verified('verified'),
  @JsonValue('role_chosen')
  roleChosen('role_chosen'),
  @JsonValue('onboarded')
  onboarded('onboarded'),
  @JsonValue('first_action')
  firstAction('first_action'),
  @JsonValue('paid')
  paid('paid'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AnalyticsStepDtoKey(this.json);

  factory AnalyticsStepDtoKey.fromJson(String json) =>
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
  static List<AnalyticsStepDtoKey> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
