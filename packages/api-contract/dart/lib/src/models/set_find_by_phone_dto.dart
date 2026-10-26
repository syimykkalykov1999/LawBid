// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_find_by_phone_dto.g.dart';

@JsonSerializable()
class SetFindByPhoneDto {
  const SetFindByPhoneDto({required this.enabled});

  factory SetFindByPhoneDto.fromJson(Map<String, Object?> json) =>
      _$SetFindByPhoneDtoFromJson(json);

  /// Clients only: people who have my number in their address book may find me.
  final bool enabled;

  Map<String, Object?> toJson() => _$SetFindByPhoneDtoToJson(this);
}
