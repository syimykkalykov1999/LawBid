// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_dry_run_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionDryRunResultDto _$PromotionDryRunResultDtoFromJson(
  Map<String, dynamic> json,
) => PromotionDryRunResultDto(
  started: json['started'] as bool,
  command: json['command'] as String,
  runsUrl: json['runsUrl'] as String?,
  message: json['message'] as String?,
);

Map<String, dynamic> _$PromotionDryRunResultDtoToJson(
  PromotionDryRunResultDto instance,
) => <String, dynamic>{
  'started': instance.started,
  'command': instance.command,
  'runsUrl': ?instance.runsUrl,
  'message': ?instance.message,
};
