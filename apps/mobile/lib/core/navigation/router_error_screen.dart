// Copyright 2013 The Flutter Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file (BSD-3-Clause, flutter/packages go_router 17.5.0
// lib/src/pages/material.dart `MaterialErrorScreen`, copied; the two words
// now come from the app's translations).
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:material_ui/material_ui.dart';

/// Row 148 (go_router 18): the page an unknown address showed on go_router
/// 17 inside a MaterialApp. go_router 18 builds this from package:material_ui
/// only, and this app's flutter/material MaterialApp would get the plain
/// WidgetsApp error page instead.
class RouterErrorScreen extends ConsumerWidget {
  /// Provide an exception to this page for it to be displayed.
  const RouterErrorScreen(this.error, {super.key});

  /// The exception to be displayed.
  final Exception? error;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return Scaffold(
      appBar: AppBar(title: Text(t.t('router.notFound.title'))),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            SelectableText(error?.toString() ?? 'page not found'),
            // Round 1 check 25.11 №27: the app has no `/` route — that led
            // to this same page again. Home is the feed.
            TextButton(
              onPressed: () => context.go(AppRoutes.feed),
              child: Text(t.t('router.notFound.home')),
            ),
          ],
        ),
      ),
    );
  }
}
