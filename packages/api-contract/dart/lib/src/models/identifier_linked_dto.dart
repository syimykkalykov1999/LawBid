// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'identifier_linked_dto.g.dart';

@JsonSerializable()
class IdentifierLinkedDto {
  const IdentifierLinkedDto({required this.linked});

  factory IdentifierLinkedDto.fromJson(Map<String, Object?> json) =>
      _$IdentifierLinkedDtoFromJson(json);

  /// Always true.
  final bool linked;

  Map<String, Object?> toJson() => _$IdentifierLinkedDtoToJson(this);
}
