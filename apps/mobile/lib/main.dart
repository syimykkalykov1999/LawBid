import 'package:lawbid/main_dev.dart' as dev;

/// Default entry point = the dev flavor (pubspec.yaml `default-flavor: dev`,
/// so a plain `flutter run` builds "LawBid Dev"). The other variants:
/// `flutter run --flavor staging -t lib/main_staging.dart`,
/// `flutter run --flavor prod -t lib/main_prod.dart` — see
/// core/config/run_app.dart.
Future<void> main() => dev.main();
