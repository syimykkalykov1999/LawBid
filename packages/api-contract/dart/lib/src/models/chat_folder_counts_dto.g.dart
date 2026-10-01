// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chat_folder_counts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChatFolderCountsDto _$ChatFolderCountsDtoFromJson(Map<String, dynamic> json) =>
    ChatFolderCountsDto(
      waiting: json['waiting'] as num,
      requests: json['requests'] as num,
    );

Map<String, dynamic> _$ChatFolderCountsDtoToJson(
  ChatFolderCountsDto instance,
) => <String, dynamic>{
  'waiting': instance.waiting,
  'requests': instance.requests,
};
