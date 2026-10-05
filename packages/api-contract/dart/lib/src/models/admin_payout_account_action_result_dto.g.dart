// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_payout_account_action_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPayoutAccountActionResultDto _$AdminPayoutAccountActionResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminPayoutAccountActionResultDto(
  account: AdminPayoutAccountRowDto.fromJson(
    json['account'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$AdminPayoutAccountActionResultDtoToJson(
  AdminPayoutAccountActionResultDto instance,
) => <String, dynamic>{'account': instance.account.toJson()};
