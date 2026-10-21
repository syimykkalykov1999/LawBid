// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chat_folder_counts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChatFolderCountsDto _$ChatFolderCountsDtoFromJson(Map<String, dynamic> json) =>
    ChatFolderCountsDto(
      waiting: json['waiting'] as num,
      requests: json['requests'] as num,
      cases: json['cases'] as num,
      archived: json['archived'] as num,
    );

Map<String, dynamic> _$ChatFolderCountsDtoToJson(
  ChatFolderCountsDto instance,
) => <String, dynamic>{
  'waiting': instance.waiting,
  'requests': instance.requests,
  'cases': instance.cases,
  'archived': instance.archived,
};
