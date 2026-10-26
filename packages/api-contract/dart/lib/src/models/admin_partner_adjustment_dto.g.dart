// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_adjustment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerAdjustmentDto _$AdminPartnerAdjustmentDtoFromJson(
  Map<String, dynamic> json,
) => AdminPartnerAdjustmentDto(
  amountCents: (json['amountCents'] as num).toInt(),
  note: json['note'] as String,
  reason: json['reason'] as String? ?? '',
);

Map<String, dynamic> _$AdminPartnerAdjustmentDtoToJson(
  AdminPartnerAdjustmentDto instance,
) => <String, dynamic>{
  'amountCents': instance.amountCents,
  'note': instance.note,
  'reason': instance.reason,
};
