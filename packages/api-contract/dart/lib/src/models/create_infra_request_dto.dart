// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_infra_request_dto_to.dart';

part 'create_infra_request_dto.g.dart';

@JsonSerializable()
class CreateInfraRequestDto {
  const CreateInfraRequestDto({required this.itemId, required this.to});

  factory CreateInfraRequestDto.fromJson(Map<String, Object?> json) =>
      _$CreateInfraRequestDtoFromJson(json);

  final String itemId;
  final CreateInfraRequestDtoTo to;

  Map<String, Object?> toJson() => _$CreateInfraRequestDtoToJson(this);
}
