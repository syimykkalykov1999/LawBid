// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum MinUrgency {
  @JsonValue('within_month')
  withinMonth('within_month'),
  @JsonValue('soon')
  soon('soon'),
  @JsonValue('urgent')
  urgent('urgent'),
  @JsonValue('very_urgent')
  veryUrgent('very_urgent'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const MinUrgency(this.json);

  factory MinUrgency.fromJson(String json) =>
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
  static List<MinUrgency> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
