// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_desk_status_dto.g.dart';

@JsonSerializable()
class SetDeskStatusDto {
  const SetDeskStatusDto({required this.away});

  factory SetDeskStatusDto.fromJson(Map<String, Object?> json) =>
      _$SetDeskStatusDtoFromJson(json);

  /// true = «отошёл» by hand, false = back on.
  final bool away;

  Map<String, Object?> toJson() => _$SetDeskStatusDtoToJson(this);
}
