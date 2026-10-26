// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_ban_dto.dart';

part 'block_result_dto.g.dart';

@JsonSerializable()
class BlockResultDto {
  const BlockResultDto({required this.bans, required this.revokedSessions});

  factory BlockResultDto.fromJson(Map<String, Object?> json) =>
      _$BlockResultDtoFromJson(json);

  final List<AdminBanDto> bans;
  final int revokedSessions;

  Map<String, Object?> toJson() => _$BlockResultDtoToJson(this);
}
