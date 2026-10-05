// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_invite_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateInviteDto _$CreateInviteDtoFromJson(Map<String, dynamic> json) =>
    CreateInviteDto(
      attorneyId: json['attorneyId'] as String,
      message: json['message'] as String?,
      budgetCents: (json['budgetCents'] as num?)?.toInt(),
    );

Map<String, dynamic> _$CreateInviteDtoToJson(CreateInviteDto instance) =>
    <String, dynamic>{
      'attorneyId': instance.attorneyId,
      'message': ?instance.message,
      'budgetCents': ?instance.budgetCents,
    };
