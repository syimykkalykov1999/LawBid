// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// deleted: never used, removed for good (the code can be reused); archived: already used, hidden and switched off so payment history stays intact.
@JsonEnum()
enum PromoDeleteOutcome {
  @JsonValue('deleted')
  deleted('deleted'),
  @JsonValue('archived')
  archived('archived'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const PromoDeleteOutcome(this.json);

  factory PromoDeleteOutcome.fromJson(String json) =>
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
  static List<PromoDeleteOutcome> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
