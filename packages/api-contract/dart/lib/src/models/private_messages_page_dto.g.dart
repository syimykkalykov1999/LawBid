// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_messages_page_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateMessagesPageDto _$PrivateMessagesPageDtoFromJson(
  Map<String, dynamic> json,
) => PrivateMessagesPageDto(
  conversationId: json['conversationId'] as String,
  attorneyId: json['attorneyId'] as String,
  clientId: json['clientId'] as String,
  items: (json['items'] as List<dynamic>)
      .map((e) => PrivateMessageItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$PrivateMessagesPageDtoToJson(
  PrivateMessagesPageDto instance,
) => <String, dynamic>{
  'conversationId': instance.conversationId,
  'attorneyId': instance.attorneyId,
  'clientId': instance.clientId,
  'items': instance.items.map((e) => e.toJson()).toList(),
  'nextCursor': ?instance.nextCursor,
};
