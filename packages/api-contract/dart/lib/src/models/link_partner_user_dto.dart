// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'link_partner_user_dto.g.dart';

@JsonSerializable()
class LinkPartnerUserDto {
  const LinkPartnerUserDto({required this.userId, this.reason = ''});

  factory LinkPartnerUserDto.fromJson(Map<String, Object?> json) =>
      _$LinkPartnerUserDtoFromJson(json);

  final String userId;
  final String reason;

  Map<String, Object?> toJson() => _$LinkPartnerUserDtoToJson(this);
}
