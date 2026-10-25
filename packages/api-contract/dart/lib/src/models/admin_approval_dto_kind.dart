// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum AdminApprovalDtoKind {
  @JsonValue('payroll_bulk_payout')
  payrollBulkPayout('payroll_bulk_payout'),
  @JsonValue('billing_refund')
  billingRefund('billing_refund'),
  @JsonValue('payroll_bonus')
  payrollBonus('payroll_bonus'),
  @JsonValue('partner_payout')
  partnerPayout('partner_payout'),
  @JsonValue('partner_commission_paid')
  partnerCommissionPaid('partner_commission_paid'),
  @JsonValue('ops_db_replica')
  opsDbReplica('ops_db_replica'),
  @JsonValue('ops_partition_start')
  opsPartitionStart('ops_partition_start'),
  @JsonValue('ops_partition_undo')
  opsPartitionUndo('ops_partition_undo'),
  @JsonValue('ops_partition_finalize')
  opsPartitionFinalize('ops_partition_finalize'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AdminApprovalDtoKind(this.json);

  factory AdminApprovalDtoKind.fromJson(String json) =>
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
  static List<AdminApprovalDtoKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
