// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum StripeReviewKind {
  @JsonValue('payout_failed')
  payoutFailed('payout_failed'),
  @JsonValue('refund_failed')
  refundFailed('refund_failed'),
  @JsonValue('dispute')
  dispute('dispute'),
  @JsonValue('early_fraud_warning')
  earlyFraudWarning('early_fraud_warning'),
  @JsonValue('account_deauthorized')
  accountDeauthorized('account_deauthorized'),
  @JsonValue('capability_disabled')
  capabilityDisabled('capability_disabled'),
  @JsonValue('reconcile_drift')
  reconcileDrift('reconcile_drift'),
  @JsonValue('duplicate_subscription')
  duplicateSubscription('duplicate_subscription'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const StripeReviewKind(this.json);

  factory StripeReviewKind.fromJson(String json) =>
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
  static List<StripeReviewKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
