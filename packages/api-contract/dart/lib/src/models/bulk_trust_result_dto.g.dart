// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bulk_trust_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BulkTrustResultDto _$BulkTrustResultDtoFromJson(Map<String, dynamic> json) =>
    BulkTrustResultDto(
      done: (json['done'] as num).toInt(),
      failed: (json['failed'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$BulkTrustResultDtoToJson(BulkTrustResultDto instance) =>
    <String, dynamic>{'done': instance.done, 'failed': instance.failed};
