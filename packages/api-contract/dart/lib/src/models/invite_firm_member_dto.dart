// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'invite_firm_member_dto.g.dart';

@JsonSerializable()
class InviteFirmMemberDto {
  const InviteFirmMemberDto({required this.username});

  factory InviteFirmMemberDto.fromJson(Map<String, Object?> json) =>
      _$InviteFirmMemberDtoFromJson(json);

  /// The lawyer's @username
  final String username;

  Map<String, Object?> toJson() => _$InviteFirmMemberDtoToJson(this);
}
