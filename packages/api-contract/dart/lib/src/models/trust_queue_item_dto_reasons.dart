// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum TrustQueueItemDtoReasons {
  @JsonValue('documents')
  documents('documents'),
  @JsonValue('firm_link')
  firmLink('firm_link'),
  @JsonValue('name_mismatch')
  nameMismatch('name_mismatch'),
  @JsonValue('duplicate_claim')
  duplicateClaim('duplicate_claim'),
  @JsonValue('registry_flag')
  registryFlag('registry_flag'),
  @JsonValue('complaint')
  complaint('complaint'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const TrustQueueItemDtoReasons(this.json);

  factory TrustQueueItemDtoReasons.fromJson(String json) =>
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
  static List<TrustQueueItemDtoReasons> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
