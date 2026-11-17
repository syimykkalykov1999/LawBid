// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bid_team_member_dto.g.dart';

@JsonSerializable()
class BidTeamMemberDto {
  const BidTeamMemberDto({
    required this.id,
    required this.firstName,
    required this.lastName,
  });

  factory BidTeamMemberDto.fromJson(Map<String, Object?> json) =>
      _$BidTeamMemberDtoFromJson(json);

  final String id;
  final String? firstName;
  final String? lastName;

  Map<String, Object?> toJson() => _$BidTeamMemberDtoToJson(this);
}
