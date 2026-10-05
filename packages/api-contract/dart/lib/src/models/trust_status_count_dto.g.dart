// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_status_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustStatusCountDto _$TrustStatusCountDtoFromJson(Map<String, dynamic> json) =>
    TrustStatusCountDto(
      status: TrustStatusCountDtoStatus.fromJson(json['status'] as String),
      attorneys: (json['attorneys'] as num).toInt(),
    );

Map<String, dynamic> _$TrustStatusCountDtoToJson(
  TrustStatusCountDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'attorneys': instance.attorneys,
};
