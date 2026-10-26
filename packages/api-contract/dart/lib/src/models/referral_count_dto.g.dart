// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralCountDto _$ReferralCountDtoFromJson(Map<String, dynamic> json) =>
    ReferralCountDto(
      key: json['key'] as String,
      count: (json['count'] as num).toInt(),
    );

Map<String, dynamic> _$ReferralCountDtoToJson(ReferralCountDto instance) =>
    <String, dynamic>{'key': instance.key, 'count': instance.count};
