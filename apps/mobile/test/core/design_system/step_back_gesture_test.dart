import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-15: "Back" in onboarding goes ONE step back, the same for
/// the button, the system back and the swipe from the edge, every time; the
/// path back stops at the choice of role (never the phone / SMS), for an
/// attorney and for a client.
void main() {
  Widget host(VoidCallback onBack, {TextDirection dir = TextDirection.ltr}) =>
      MaterialApp(
        builder: (context, child) =>
            Directionality(textDirection: dir, child: child!),
        home: StepBackGesture(
          onBack: onBack,
          child: const Scaffold(body: Center(child: Text('step'))),
        ),
      );

  testWidgets('a swipe from the left edge goes back once', (tester) async {
    var backs = 0;
    await tester.pumpWidget(host(() => backs++));
    await tester.dragFrom(const Offset(4, 300), const Offset(160, 0));
    await tester.pumpAndSettle();
    expect(backs, 1);
  });

  testWidgets('a drag that starts in the middle does nothing', (tester) async {
    var backs = 0;
    await tester.pumpWidget(host(() => backs++));
    await tester.dragFrom(const Offset(200, 300), const Offset(160, 0));
    await tester.pumpAndSettle();
    expect(backs, 0);
  });

  testWidgets('a swipe the wrong way from the edge does nothing',
      (tester) async {
    var backs = 0;
    await tester.pumpWidget(host(() => backs++));
    await tester.dragFrom(const Offset(20, 300), const Offset(-15, 0));
    await tester.pumpAndSettle();
    expect(backs, 0);
  });

  testWidgets('RTL: the swipe comes from the right edge', (tester) async {
    var backs = 0;
    await tester.pumpWidget(host(() => backs++, dir: TextDirection.rtl));
    final right = tester.view.physicalSize.width / tester.view.devicePixelRatio;
    await tester.dragFrom(Offset(right - 4, 300), const Offset(-160, 0));
    await tester.pumpAndSettle();
    expect(backs, 1);
    await tester.dragFrom(const Offset(4, 300), const Offset(160, 0));
    await tester.pumpAndSettle();
    expect(backs, 1);
  });

  testWidgets('the system back does the same single step', (tester) async {
    var backs = 0;
    await tester.pumpWidget(host(() => backs++));
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(backs, 1);
  });

  testWidgets('without a target it leaves the screen alone', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: StepBackGesture(
          onBack: null,
          child: Scaffold(body: Text('first step')),
        ),
      ),
    );
    expect(find.text('first step'), findsOneWidget);
  });

  group('the way back, one screen per press', () {
    List<OnboardingStepId> chainBack(OnboardingStepId from, UserRole role) {
      final out = <OnboardingStepId>[];
      var step = from.previousFor(role);
      while (step != null) {
        out.add(step);
        step = step.previousFor(role);
      }
      return out;
    }

    test('attorney: verification, profile, role, consents', () {
      expect(chainBack(OnboardingStepId.verification, UserRole.attorney), [
        OnboardingStepId.profile,
        OnboardingStepId.role,
        OnboardingStepId.consents,
      ]);
    });

    test('client: profile, role, consents', () {
      expect(chainBack(OnboardingStepId.profile, UserRole.client), [
        OnboardingStepId.role,
        OnboardingStepId.consents,
      ]);
    });
  });
}
