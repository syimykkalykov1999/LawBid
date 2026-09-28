// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Required when decision = rejected.
@JsonEnum()
enum LicenseDecisionDtoRejectionCode {
  @JsonValue('license_not_found')
  licenseNotFound('license_not_found'),
  @JsonValue('license_inactive')
  licenseInactive('license_inactive'),
  @JsonValue('name_mismatch')
  nameMismatch('name_mismatch'),
  @JsonValue('document_unreadable')
  documentUnreadable('document_unreadable'),
  @JsonValue('document_expired')
  documentExpired('document_expired'),
  @JsonValue('selfie_mismatch')
  selfieMismatch('selfie_mismatch'),
  @JsonValue('suspected_fraud')
  suspectedFraud('suspected_fraud'),
  @JsonValue('incomplete_submission')
  incompleteSubmission('incomplete_submission'),
  @JsonValue('other')
  other('other'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const LicenseDecisionDtoRejectionCode(this.json);

  factory LicenseDecisionDtoRejectionCode.fromJson(String json) =>
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
  static List<LicenseDecisionDtoRejectionCode> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
