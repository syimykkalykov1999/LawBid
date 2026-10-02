// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_video_status_count_dto_status.dart';

part 'admin_video_status_count_dto.g.dart';

@JsonSerializable()
class AdminVideoStatusCountDto {
  const AdminVideoStatusCountDto({required this.status, required this.count});

  factory AdminVideoStatusCountDto.fromJson(Map<String, Object?> json) =>
      _$AdminVideoStatusCountDtoFromJson(json);

  final AdminVideoStatusCountDtoStatus status;
  final int count;

  Map<String, Object?> toJson() => _$AdminVideoStatusCountDtoToJson(this);
}
