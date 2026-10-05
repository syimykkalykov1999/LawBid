// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum FraudSignalCode {
  @JsonValue('fraud_reports')
  fraudReports('fraud_reports'),
  @JsonValue('other_reports')
  otherReports('other_reports'),
  @JsonValue('contact_issues')
  contactIssues('contact_issues'),
  @JsonValue('chargebacks')
  chargebacks('chargebacks'),
  @JsonValue('cancelled_after_bids')
  cancelledAfterBids('cancelled_after_bids'),
  @JsonValue('shared_with_blocked')
  sharedWithBlocked('shared_with_blocked'),
  @JsonValue('weak_shared_with_blocked')
  weakSharedWithBlocked('weak_shared_with_blocked'),
  @JsonValue('many_accounts_on_device')
  manyAccountsOnDevice('many_accounts_on_device'),
  @JsonValue('duplicate_text')
  duplicateText('duplicate_text'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const FraudSignalCode(this.json);

  factory FraudSignalCode.fromJson(String json) =>
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
  static List<FraudSignalCode> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
