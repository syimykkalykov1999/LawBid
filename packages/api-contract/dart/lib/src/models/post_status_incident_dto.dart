// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_status_incident_dto_component.dart';
import 'post_status_incident_dto_kind.dart';

part 'post_status_incident_dto.g.dart';

@JsonSerializable()
class PostStatusIncidentDto {
  const PostStatusIncidentDto({
    required this.component,
    required this.kind,
    required this.titleRu,
    this.titleEn,
    this.messageRu,
    this.messageEn,
  });

  factory PostStatusIncidentDto.fromJson(Map<String, Object?> json) =>
      _$PostStatusIncidentDtoFromJson(json);

  final PostStatusIncidentDtoComponent component;
  final PostStatusIncidentDtoKind kind;
  final String titleRu;
  final String? titleEn;
  final String? messageRu;
  final String? messageEn;

  Map<String, Object?> toJson() => _$PostStatusIncidentDtoToJson(this);
}
