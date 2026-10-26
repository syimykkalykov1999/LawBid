// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_counts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCountsDto _$AdminCountsDtoFromJson(Map<String, dynamic> json) =>
    AdminCountsDto(
      verificationQueue: (json['verificationQueue'] as num).toInt(),
      openReports: (json['openReports'] as num).toInt(),
      supportUnread: (json['supportUnread'] as num).toInt(),
      trustQueue: (json['trustQueue'] as num).toInt(),
    );

Map<String, dynamic> _$AdminCountsDtoToJson(AdminCountsDto instance) =>
    <String, dynamic>{
      'verificationQueue': instance.verificationQueue,
      'openReports': instance.openReports,
      'supportUnread': instance.supportUnread,
      'trustQueue': instance.trustQueue,
    };
