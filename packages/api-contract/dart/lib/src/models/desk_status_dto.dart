// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'desk_presence.dart';

part 'desk_status_dto.g.dart';

@JsonSerializable()
class DeskStatusDto {
  const DeskStatusDto({required this.status});

  factory DeskStatusDto.fromJson(Map<String, Object?> json) =>
      _$DeskStatusDtoFromJson(json);

  final DeskPresence status;

  Map<String, Object?> toJson() => _$DeskStatusDtoToJson(this);
}
