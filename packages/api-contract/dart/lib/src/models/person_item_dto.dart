// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_list_item_dto.dart';
import 'client_list_item_dto.dart';
import 'person_role.dart';

part 'person_item_dto.g.dart';

@JsonSerializable()
class PersonItemDto {
  const PersonItemDto({required this.role, this.attorney, this.client});

  factory PersonItemDto.fromJson(Map<String, Object?> json) =>
      _$PersonItemDtoFromJson(json);

  final PersonRole role;
  final AttorneyListItemDto? attorney;
  final ClientListItemDto? client;

  Map<String, Object?> toJson() => _$PersonItemDtoToJson(this);
}
