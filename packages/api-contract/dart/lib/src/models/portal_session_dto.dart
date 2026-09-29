// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'portal_session_dto.g.dart';

@JsonSerializable()
class PortalSessionDto {
  const PortalSessionDto({required this.url});

  factory PortalSessionDto.fromJson(Map<String, Object?> json) =>
      _$PortalSessionDtoFromJson(json);

  final String url;

  Map<String, Object?> toJson() => _$PortalSessionDtoToJson(this);
}
