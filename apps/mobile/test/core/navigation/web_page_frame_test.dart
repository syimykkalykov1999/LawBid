import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';

import '../../helpers/ux_harness.dart';

void main() {
  Future<Rect> bodyRect(WidgetTester t, String location, Size size) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    adaptiveShellOverride = true;
    addTearDown(() => adaptiveShellOverride = null);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: WebPageFrame(
            location: location,
            child: const SizedBox.expand(key: Key('page')),
          ),
        ),
        theme: AppTheme.dark(),
        size: size,
        overrides: uxOverrides(),
      ),
    );
    await t.pump();
    return t.getRect(find.byKey(const Key('page')));
  }

  testWidgets('a pushed screen sits in the 680 column next to the menu',
      (t) async {
    final r = await bodyRect(t, '/chats', const Size(1400, 900));
    expect(r.left, closeTo(470, 1));
    expect(r.width, 680);
  });

  testWidgets('sign-in and onboarding: a 480 column, no menu', (t) async {
    for (final loc in ['/welcome', '/auth/phone', '/onboarding/role']) {
      final r = await bodyRect(t, loc, const Size(1400, 900));
      expect(r.width, 480, reason: loc);
      expect(r.left, closeTo(460, 1), reason: loc);
    }
  });

  testWidgets('a phone-sized window is left as it is', (t) async {
    final r = await bodyRect(t, '/chats', const Size(390, 844));
    expect(r.width, 390);
  });
}
