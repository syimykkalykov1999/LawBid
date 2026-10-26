// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_chat_ids_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedChatIdsDto _$SavedChatIdsDtoFromJson(Map<String, dynamic> json) =>
    SavedChatIdsDto(
      ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
    );

Map<String, dynamic> _$SavedChatIdsDtoToJson(SavedChatIdsDto instance) =>
    <String, dynamic>{'ids': instance.ids};
