// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'consents_saved_dto.g.dart';

@JsonSerializable()
class ConsentsSavedDto {
  const ConsentsSavedDto({required this.saved});

  factory ConsentsSavedDto.fromJson(Map<String, Object?> json) =>
      _$ConsentsSavedDtoFromJson(json);

  /// Always true.
  final bool saved;

  Map<String, Object?> toJson() => _$ConsentsSavedDtoToJson(this);
}
