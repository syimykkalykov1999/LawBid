import 'package:flutter/widgets.dart';

/// A tiny library the deferred-screen test imports `deferred` under two
/// prefixes, like the Archive screen was (app_router + chat_routes).
class DeferredFixtureScreen extends StatelessWidget {
  const DeferredFixtureScreen({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Text(label);
}
