// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_disappearing_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetDisappearingDto _$SetDisappearingDtoFromJson(Map<String, dynamic> json) =>
    SetDisappearingDto(
      afterS: json['afterS'] == null
          ? null
          : SetDisappearingDtoAfterS.fromJson(json['afterS'] as num),
    );

Map<String, dynamic> _$SetDisappearingDtoToJson(SetDisappearingDto instance) =>
    <String, dynamic>{'afterS': ?instance.afterS?.toJson()};
