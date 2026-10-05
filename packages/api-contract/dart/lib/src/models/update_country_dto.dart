// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_country_dto.g.dart';

@JsonSerializable()
class UpdateCountryDto {
  const UpdateCountryDto({required this.isEnabled});

  factory UpdateCountryDto.fromJson(Map<String, Object?> json) =>
      _$UpdateCountryDtoFromJson(json);

  final bool isEnabled;

  Map<String, Object?> toJson() => _$UpdateCountryDtoToJson(this);
}
