import 'package:flutter/material.dart';

/// Owner 2026-10-15 (web, step 1): the web build exists but stays closed
/// until it is switched on with `--dart-define=WEB_ENABLED=true` (CI builds
/// it that way to prove it compiles; a deploy decides when to ship it).
/// Android and iOS never look at this.
const bool kWebEnabled = bool.fromEnvironment('WEB_ENABLED');

/// What a browser sees while the web version is not switched on.
class WebGateApp extends StatelessWidget {
  const WebGateApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Builder(
                builder: (context) => Text(
                  'LawBid on the web is coming soon.\n'
                  'For now, use the LawBid app.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ),
          ),
        ),
      );
}
