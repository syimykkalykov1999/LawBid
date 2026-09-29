// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'read_notifications_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReadNotificationsDto _$ReadNotificationsDtoFromJson(
  Map<String, dynamic> json,
) => ReadNotificationsDto(
  ids: (json['ids'] as List<dynamic>?)?.map((e) => e as String).toList(),
  all: json['all'] as bool?,
);

Map<String, dynamic> _$ReadNotificationsDtoToJson(
  ReadNotificationsDto instance,
) => <String, dynamic>{'ids': ?instance.ids, 'all': ?instance.all};
