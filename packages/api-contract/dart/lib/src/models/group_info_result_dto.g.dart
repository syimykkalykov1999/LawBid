// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_info_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupInfoResultDto _$GroupInfoResultDtoFromJson(Map<String, dynamic> json) =>
    GroupInfoResultDto(
      epoch: json['epoch'] as num,
      groupInfo: json['groupInfo'] as String?,
      url: json['url'] as String?,
    );

Map<String, dynamic> _$GroupInfoResultDtoToJson(GroupInfoResultDto instance) =>
    <String, dynamic>{
      'epoch': instance.epoch,
      'groupInfo': ?instance.groupInfo,
      'url': ?instance.url,
    };
