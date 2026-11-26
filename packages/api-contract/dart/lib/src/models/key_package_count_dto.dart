// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'key_package_count_dto.g.dart';

@JsonSerializable()
class KeyPackageCountDto {
  const KeyPackageCountDto({
    required this.oneTime,
    required this.lastResort,
    required this.target,
  });

  factory KeyPackageCountDto.fromJson(Map<String, Object?> json) =>
      _$KeyPackageCountDtoFromJson(json);

  /// One-time KeyPackages left on the server.
  final num oneTime;
  final bool lastResort;

  /// chat.e2ee_key_packages_target: the app tops up below half of it.
  final num target;

  Map<String, Object?> toJson() => _$KeyPackageCountDtoToJson(this);
}
