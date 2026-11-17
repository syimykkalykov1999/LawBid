// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_team_member_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidTeamMemberDto _$BidTeamMemberDtoFromJson(Map<String, dynamic> json) =>
    BidTeamMemberDto(
      id: json['id'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
    );

Map<String, dynamic> _$BidTeamMemberDtoToJson(BidTeamMemberDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
    };
