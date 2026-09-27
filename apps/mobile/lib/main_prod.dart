import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/config/run_app.dart';

/// Entry point of the prod flavor (see core/config/run_app.dart):
/// `flutter run --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json`
Future<void> main() => runLawBid(AppFlavor.prod);
