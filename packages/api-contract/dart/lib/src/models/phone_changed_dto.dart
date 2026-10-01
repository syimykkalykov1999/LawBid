// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'phone_changed_dto.g.dart';

@JsonSerializable()
class PhoneChangedDto {
  const PhoneChangedDto({
    required this.userId,
    required this.phone,
    required this.revokedSessions,
  });

  factory PhoneChangedDto.fromJson(Map<String, Object?> json) =>
      _$PhoneChangedDtoFromJson(json);

  final String userId;
  final String phone;
  final num revokedSessions;

  Map<String, Object?> toJson() => _$PhoneChangedDtoToJson(this);
}
