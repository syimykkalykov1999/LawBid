// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_notice_brief_dto.dart';

part 'dmca_mine_dto.g.dart';

@JsonSerializable()
class DmcaMineDto {
  const DmcaMineDto({required this.submitted, required this.against});

  factory DmcaMineDto.fromJson(Map<String, Object?> json) =>
      _$DmcaMineDtoFromJson(json);

  /// Notices I submitted, newest first (≤ 50).
  final List<DmcaNoticeBriefDto> submitted;

  /// Notices against my content, newest first (≤ 50).
  final List<DmcaNoticeBriefDto> against;

  Map<String, Object?> toJson() => _$DmcaMineDtoToJson(this);
}
