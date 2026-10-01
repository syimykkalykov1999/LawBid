// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'organize_conversation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OrganizeConversationDto _$OrganizeConversationDtoFromJson(
  Map<String, dynamic> json,
) => OrganizeConversationDto(
  folder: json['folder'] == null
      ? null
      : OrganizeConversationDtoFolder.fromJson(json['folder'] as String),
  waiting: json['waiting'] as bool?,
  note: json['note'] as String?,
  pinned: json['pinned'] as bool?,
);

Map<String, dynamic> _$OrganizeConversationDtoToJson(
  OrganizeConversationDto instance,
) => <String, dynamic>{
  'folder': ?instance.folder?.toJson(),
  'waiting': ?instance.waiting,
  'note': ?instance.note,
  'pinned': ?instance.pinned,
};
