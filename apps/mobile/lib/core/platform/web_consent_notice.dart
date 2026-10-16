import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kKey = 'web.notice.v1';

/// Applies the saved choice at start (web only).
void applyWebNoticeChoice(SharedPreferences prefs) {
  if (kIsWeb && prefs.getString(_kKey) == 'declined') AppEvents.optedOut = true;
}

/// Owner 2026-10-15 (web): the small notice every site shows on the first
/// visit. It uses the app's own consent wording (the optional analytics
/// consent and the privacy policy); «accept» keeps statistics on, the
/// close button turns them off. Shown once per browser; the phone apps
/// never show it (they ask during onboarding).
class WebConsentNotice extends ConsumerStatefulWidget {
  const WebConsentNotice({
    required this.child,
    required this.onOpenPrivacy,
    super.key,
  });

  final Widget child;
  final VoidCallback onOpenPrivacy;

  @override
  ConsumerState<WebConsentNotice> createState() => _WebConsentNoticeState();
}

class _WebConsentNoticeState extends ConsumerState<WebConsentNotice> {
  bool _answered = false;

  // Shown a moment after the first screen is up: its buttons would join the
  // browser's first focus pass, which runs before the first layout.
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      Future<void>.delayed(const Duration(milliseconds: 1200), () {
        if (mounted) setState(() => _ready = true);
      });
    }
  }

  void _answer(SharedPreferences prefs, {required bool accepted}) {
    if (!accepted) AppEvents.optedOut = true;
    prefs.setString(_kKey, accepted ? 'accepted' : 'declined');
    setState(() => _answered = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return widget.child;
    final prefs = ref.watch(sharedPreferencesProvider);
    final show = _ready && !_answered && prefs.getString(_kKey) == null;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        if (!show)
          const SizedBox.shrink()
        else
          Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Align(
              // Wide window: in the corner, away from the page's buttons.
              alignment:
                  MediaQuery.sizeOf(context).width >= kShellExtendedMinWidth
                      ? AlignmentDirectional.bottomStart
                      : Alignment.bottomCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Material(
                  color: colors.sheet,
                  elevation: 6,
                  borderRadius: BorderRadius.circular(AppRadii.card),
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t.t('onboarding.consents.analytics'),
                          style: type.bodySmall.copyWith(color: colors.text),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        GestureDetector(
                          onTap: widget.onOpenPrivacy,
                          child: Text(
                            t.t('legal.doc.privacy'),
                            style: type.bodySmall.copyWith(
                              color: colors.goldAccent,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () =>
                                    _answer(prefs, accepted: false),
                                child: Text(t.t('common.close')),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: FilledButton(
                                onPressed: () => _answer(prefs, accepted: true),
                                child: Text(
                                  t.t('onboarding.consents.disclaimer.accept'),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
