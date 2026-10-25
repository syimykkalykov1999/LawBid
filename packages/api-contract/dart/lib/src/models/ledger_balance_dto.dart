// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ledger_balance_dto_owner_key.dart';
import 'ledger_balance_dto_type.dart';

part 'ledger_balance_dto.g.dart';

@JsonSerializable()
class LedgerBalanceDto {
  const LedgerBalanceDto({
    required this.code,
    required this.type,
    required this.currency,
    required this.ownerKey,
    required this.debitCents,
    required this.creditCents,
  });

  factory LedgerBalanceDto.fromJson(Map<String, Object?> json) =>
      _$LedgerBalanceDtoFromJson(json);

  final String code;
  final LedgerBalanceDtoType type;
  final String currency;
  final LedgerBalanceDtoOwnerKey ownerKey;
  final int debitCents;
  final int creditCents;

  Map<String, Object?> toJson() => _$LedgerBalanceDtoToJson(this);
}
