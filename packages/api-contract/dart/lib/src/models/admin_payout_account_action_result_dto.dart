// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_payout_account_row_dto.dart';

part 'admin_payout_account_action_result_dto.g.dart';

@JsonSerializable()
class AdminPayoutAccountActionResultDto {
  const AdminPayoutAccountActionResultDto({required this.account});

  factory AdminPayoutAccountActionResultDto.fromJson(
    Map<String, Object?> json,
  ) => _$AdminPayoutAccountActionResultDtoFromJson(json);

  final AdminPayoutAccountRowDto account;

  Map<String, Object?> toJson() =>
      _$AdminPayoutAccountActionResultDtoToJson(this);
}
