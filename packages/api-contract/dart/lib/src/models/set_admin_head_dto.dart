// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_admin_head_dto.g.dart';

@JsonSerializable()
class SetAdminHeadDto {
  const SetAdminHeadDto({required this.head});

  factory SetAdminHeadDto.fromJson(Map<String, Object?> json) =>
      _$SetAdminHeadDtoFromJson(json);

  /// true = make this admin the head of their workspace; false = clear it.
  final bool head;

  Map<String, Object?> toJson() => _$SetAdminHeadDtoToJson(this);
}
