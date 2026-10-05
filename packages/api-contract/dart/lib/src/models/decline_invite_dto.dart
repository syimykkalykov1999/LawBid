// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'decline_invite_dto.g.dart';

@JsonSerializable()
class DeclineInviteDto {
  const DeclineInviteDto({this.reason});

  factory DeclineInviteDto.fromJson(Map<String, Object?> json) =>
      _$DeclineInviteDtoFromJson(json);

  final String? reason;

  Map<String, Object?> toJson() => _$DeclineInviteDtoToJson(this);
}
