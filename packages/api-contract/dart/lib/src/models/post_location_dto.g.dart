// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_location_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostLocationDto _$PostLocationDtoFromJson(Map<String, dynamic> json) =>
    PostLocationDto(
      name: json['name'] as String,
      lat: json['lat'] as num?,
      lng: json['lng'] as num?,
    );

Map<String, dynamic> _$PostLocationDtoToJson(PostLocationDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'lat': ?instance.lat,
      'lng': ?instance.lng,
    };
