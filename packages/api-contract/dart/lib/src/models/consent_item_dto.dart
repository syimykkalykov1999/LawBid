// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consent_item_dto_type.dart';

part 'consent_item_dto.g.dart';

@JsonSerializable()
class ConsentItemDto {
  const ConsentItemDto({
    required this.type,
    required this.granted,
    this.documentId,
  });

  factory ConsentItemDto.fromJson(Map<String, Object?> json) =>
      _$ConsentItemDtoFromJson(json);

  final ConsentItemDtoType type;
  final bool granted;
  final String? documentId;

  Map<String, Object?> toJson() => _$ConsentItemDtoToJson(this);
}
