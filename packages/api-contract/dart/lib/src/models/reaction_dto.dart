// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reaction_dto.g.dart';

@JsonSerializable()
class ReactionDto {
  const ReactionDto({
    required this.emoji,
    required this.count,
    required this.mine,
  });
  
  factory ReactionDto.fromJson(Map<String, Object?> json) => _$ReactionDtoFromJson(json);
  
  final String emoji;
  final int count;

  /// The viewer chose this one.
  final bool mine;

  Map<String, Object?> toJson() => _$ReactionDtoToJson(this);
}
