// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_firm_dto.g.dart';

@JsonSerializable()
class CreateFirmDto {
  const CreateFirmDto({required this.name});

  factory CreateFirmDto.fromJson(Map<String, Object?> json) =>
      _$CreateFirmDtoFromJson(json);

  final String name;

  Map<String, Object?> toJson() => _$CreateFirmDtoToJson(this);
}
