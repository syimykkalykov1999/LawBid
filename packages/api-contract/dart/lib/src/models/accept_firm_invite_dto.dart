// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'accept_firm_invite_dto.g.dart';

@JsonSerializable()
class AcceptFirmInviteDto {
  const AcceptFirmInviteDto({this.firmId});

  factory AcceptFirmInviteDto.fromJson(Map<String, Object?> json) =>
      _$AcceptFirmInviteDtoFromJson(json);

  /// Which invitation; the newest one when left out
  final String? firmId;

  Map<String, Object?> toJson() => _$AcceptFirmInviteDtoToJson(this);
}
