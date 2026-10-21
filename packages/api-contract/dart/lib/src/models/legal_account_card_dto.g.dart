// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_account_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalAccountCardDto _$LegalAccountCardDtoFromJson(Map<String, dynamic> json) =>
    LegalAccountCardDto(
      profile: json['profile'],
      usernames: json['usernames'] as List<dynamic>,
      counts: Map<String, num>.from(json['counts'] as Map),
      conversations: json['conversations'] as List<dynamic>,
      groups: json['groups'] as List<dynamic>,
      channels: json['channels'] as List<dynamic>,
      sessions: json['sessions'] as List<dynamic>,
      holds: json['holds'] as List<dynamic>,
    );

Map<String, dynamic> _$LegalAccountCardDtoToJson(
  LegalAccountCardDto instance,
) => <String, dynamic>{
  'profile': ?instance.profile,
  'usernames': instance.usernames,
  'counts': instance.counts,
  'conversations': instance.conversations,
  'groups': instance.groups,
  'channels': instance.channels,
  'sessions': instance.sessions,
  'holds': instance.holds,
};
