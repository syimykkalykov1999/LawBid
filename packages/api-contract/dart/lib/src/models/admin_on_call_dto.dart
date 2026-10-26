// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_on_call_dto.g.dart';

@JsonSerializable()
class AdminOnCallDto {
  const AdminOnCallDto({required this.enabled});

  factory AdminOnCallDto.fromJson(Map<String, Object?> json) =>
      _$AdminOnCallDtoFromJson(json);

  /// Get push + e-mail when the system breaks.
  final bool enabled;

  Map<String, Object?> toJson() => _$AdminOnCallDtoToJson(this);
}
