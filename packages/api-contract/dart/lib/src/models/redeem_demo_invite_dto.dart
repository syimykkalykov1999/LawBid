// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'redeem_demo_invite_dto.g.dart';

@JsonSerializable()
class RedeemDemoInviteDto {
  const RedeemDemoInviteDto({required this.code});

  factory RedeemDemoInviteDto.fromJson(Map<String, Object?> json) =>
      _$RedeemDemoInviteDtoFromJson(json);

  /// 8 letters/digits the admin handed out.
  final String code;

  Map<String, Object?> toJson() => _$RedeemDemoInviteDtoToJson(this);
}
