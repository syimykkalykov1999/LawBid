// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum TrustStatusCountDtoStatus {
  @JsonValue('not_verified')
  notVerified('not_verified'),
  @JsonValue('self_declared')
  selfDeclared('self_declared'),
  @JsonValue('registry_matched')
  registryMatched('registry_matched'),
  @JsonValue('pending_review')
  pendingReview('pending_review'),
  @JsonValue('documents_requested')
  documentsRequested('documents_requested'),
  @JsonValue('cleared')
  cleared('cleared'),
  @JsonValue('rejected')
  rejected('rejected'),
  @JsonValue('suspended')
  suspended('suspended'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const TrustStatusCountDtoStatus(this.json);

  factory TrustStatusCountDtoStatus.fromJson(String json) =>
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
  static List<TrustStatusCountDtoStatus> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
