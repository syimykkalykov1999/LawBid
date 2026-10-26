// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'registry_link_dto.g.dart';

@JsonSerializable()
class RegistryLinkDto {
  const RegistryLinkDto({
    required this.stateCode,
    required this.stateName,
    required this.url,
  });

  factory RegistryLinkDto.fromJson(Map<String, Object?> json) =>
      _$RegistryLinkDtoFromJson(json);

  final String stateCode;
  final String stateName;

  /// Where to check the bar number yourself.
  final String? url;

  Map<String, Object?> toJson() => _$RegistryLinkDtoToJson(this);
}
