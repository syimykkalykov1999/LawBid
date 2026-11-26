import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/session/sign_out_hooks.dart';

void main() {
  testWidgets(
      'hooks run in order, a failing hook never stops sign-out, '
      'one registration per hook', (tester) async {
    final seen = <String>[];
    Future<SignOutServerCall?> a(WidgetRef ref) async {
      seen.add('a');
      return (dio, extras) async => null;
    }

    Future<SignOutServerCall?> broken(WidgetRef ref) async {
      seen.add('broken');
      throw StateError('keys gone');
    }

    Future<SignOutServerCall?> none(WidgetRef ref) async {
      seen.add('none');
      return null;
    }

    SignOutHooks.register(a);
    SignOutHooks.register(a);
    SignOutHooks.register(broken);
    SignOutHooks.register(none);
    late WidgetRef captured;
    await tester.pumpWidget(
      ProviderScope(
        child: Consumer(
          builder: (_, ref, __) {
            captured = ref;
            return const SizedBox();
          },
        ),
      ),
    );
    final calls = await SignOutHooks.run(captured);
    expect(seen, ['a', 'broken', 'none']);
    expect(calls, hasLength(1));
  });
}
