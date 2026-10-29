// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'qr_login_answered_dto.g.dart';

@JsonSerializable()
class QrLoginAnsweredDto {
  const QrLoginAnsweredDto({
    required this.ok,
  });
  
  factory QrLoginAnsweredDto.fromJson(Map<String, Object?> json) => _$QrLoginAnsweredDtoFromJson(json);
  
  final bool ok;

  Map<String, Object?> toJson() => _$QrLoginAnsweredDtoToJson(this);
}
