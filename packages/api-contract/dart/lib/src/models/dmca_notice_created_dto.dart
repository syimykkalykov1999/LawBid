// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_status.dart';

part 'dmca_notice_created_dto.g.dart';

@JsonSerializable()
class DmcaNoticeCreatedDto {
  const DmcaNoticeCreatedDto({required this.id, required this.status});

  factory DmcaNoticeCreatedDto.fromJson(Map<String, Object?> json) =>
      _$DmcaNoticeCreatedDtoFromJson(json);

  final String id;
  final DmcaStatus status;

  Map<String, Object?> toJson() => _$DmcaNoticeCreatedDtoToJson(this);
}
