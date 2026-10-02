// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_media_reason_dto.g.dart';

@JsonSerializable()
class AdminMediaReasonDto {
  const AdminMediaReasonDto({required this.reason});

  factory AdminMediaReasonDto.fromJson(Map<String, Object?> json) =>
      _$AdminMediaReasonDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminMediaReasonDtoToJson(this);
}
