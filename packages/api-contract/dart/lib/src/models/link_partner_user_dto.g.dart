// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'link_partner_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LinkPartnerUserDto _$LinkPartnerUserDtoFromJson(Map<String, dynamic> json) =>
    LinkPartnerUserDto(
      userId: json['userId'] as String,
      reason: json['reason'] as String? ?? '',
    );

Map<String, dynamic> _$LinkPartnerUserDtoToJson(LinkPartnerUserDto instance) =>
    <String, dynamic>{'userId': instance.userId, 'reason': instance.reason};
