// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_approvals_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminApprovalsCountDto _$AdminApprovalsCountDtoFromJson(
  Map<String, dynamic> json,
) => AdminApprovalsCountDto(
  pending: (json['pending'] as num).toInt(),
  limitCents: (json['limitCents'] as num).toInt(),
  dualControl: json['dualControl'] as bool,
);

Map<String, dynamic> _$AdminApprovalsCountDtoToJson(
  AdminApprovalsCountDto instance,
) => <String, dynamic>{
  'pending': instance.pending,
  'limitCents': instance.limitCents,
  'dualControl': instance.dualControl,
};
