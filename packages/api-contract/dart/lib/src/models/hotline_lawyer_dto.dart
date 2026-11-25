// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_lawyer_dto.g.dart';

@JsonSerializable()
class HotlineLawyerDto {
  const HotlineLawyerDto({
    required this.id,
    required this.name,
    required this.state,
    this.username,
    this.avatarUrl,
    this.barNumber,
  });

  factory HotlineLawyerDto.fromJson(Map<String, Object?> json) =>
      _$HotlineLawyerDtoFromJson(json);

  final String id;
  final String name;
  final String? username;
  final String? avatarUrl;

  /// The client’s state
  final String state;

  /// Bar number there.
  final String? barNumber;

  Map<String, Object?> toJson() => _$HotlineLawyerDtoToJson(this);
}
