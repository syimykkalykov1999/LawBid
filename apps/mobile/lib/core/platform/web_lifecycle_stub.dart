import 'package:lawbid/core/platform/web_lifecycle.dart';

/// Not a browser: nothing to listen to.
void attach(
  void Function(WebLifecycleKind kind) report, {
  required bool initialOnline,
}) {}

bool browserIsOnline() => true;
