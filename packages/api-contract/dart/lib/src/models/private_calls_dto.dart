// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'private_call_item_dto.dart';

part 'private_calls_dto.g.dart';

@JsonSerializable()
class PrivateCallsDto {
  const PrivateCallsDto({required this.items});

  factory PrivateCallsDto.fromJson(Map<String, Object?> json) =>
      _$PrivateCallsDtoFromJson(json);

  final List<PrivateCallItemDto> items;

  Map<String, Object?> toJson() => _$PrivateCallsDtoToJson(this);
}
