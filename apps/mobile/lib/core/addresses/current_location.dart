import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

/// Owner 2026-11-01 (WhatsApp / Telegram «Send my location»): where the
/// phone is now, for a chat «Place» card. Free: the phone's own GPS, no
/// address lookup and no third-party service; the card carries plain
/// «latitude, longitude», which every maps app opens (see MapsLinks).
sealed class CurrentLocation {
  const CurrentLocation();
}

/// The phone knows where it is.
final class LocationFound extends CurrentLocation {
  const LocationFound(this.latitude, this.longitude);

  final double latitude;
  final double longitude;

  /// «40.712800, -74.006000» — six digits is about 11 cm.
  String get text =>
      '${latitude.toStringAsFixed(6)}, ${longitude.toStringAsFixed(6)}';
}

/// Nothing was shared: no permission, location switched off or no fix.
final class LocationUnavailable extends CurrentLocation {
  const LocationUnavailable();
}

/// The seam for tests; production uses [GeolocatorSource].
// ignore: one_member_abstracts
abstract interface class LocationSource {
  Future<CurrentLocation> current();
}

/// geolocator (MIT): asks for the «while using the app» permission when it
/// is needed, then reads one fix. Never throws.
class GeolocatorSource implements LocationSource {
  const GeolocatorSource();

  @override
  Future<CurrentLocation> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocationUnavailable();
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return const LocationUnavailable();
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          timeLimit: Duration(seconds: 15),
        ),
      );
      return LocationFound(p.latitude, p.longitude);
    } on Object {
      return const LocationUnavailable();
    }
  }
}

final locationSourceProvider = Provider<LocationSource>(
  (ref) => const GeolocatorSource(),
);
