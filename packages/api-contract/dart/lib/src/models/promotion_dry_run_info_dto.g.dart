// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_dry_run_info_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionDryRunInfoDto _$PromotionDryRunInfoDtoFromJson(
  Map<String, dynamic> json,
) => PromotionDryRunInfoDto(
  canStart: json['canStart'] as bool,
  command: json['command'] as String,
);

Map<String, dynamic> _$PromotionDryRunInfoDtoToJson(
  PromotionDryRunInfoDto instance,
) => <String, dynamic>{
  'canStart': instance.canStart,
  'command': instance.command,
};
