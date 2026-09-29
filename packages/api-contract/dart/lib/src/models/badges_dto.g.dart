// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'badges_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BadgesDto _$BadgesDtoFromJson(Map<String, dynamic> json) => BadgesDto(
  chatsUnread: json['chatsUnread'] as num,
  notificationsUnread: json['notificationsUnread'] as num,
  total: json['total'] as num,
);

Map<String, dynamic> _$BadgesDtoToJson(BadgesDto instance) => <String, dynamic>{
  'chatsUnread': instance.chatsUnread,
  'notificationsUnread': instance.notificationsUnread,
  'total': instance.total,
};
