import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/pop_then_push.dart';
import 'package:lawbid/core/safety/block_and_report.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_screen_addon.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart'
    show stateName;
import 'package:lawbid/features/chat/application/voice_recorder.dart'
    show voiceClock;
import 'package:lawbid/features/hotline/application/hotline_attorney_controller.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:lawbid/features/hotline/presentation/hotline_line_screen.dart'
    show hotlineLanguageLabel;
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:material_ui/material_ui.dart';

/// The call screen's add-on for the line's call (mockup a4–a7: chips, «⋯»,
/// «Клиент ждёт»), handed to the calls code through its slot — the calls
/// code never imports this feature. Null: no hotline call now.
CallScreenAddon? hotlineAttorneyAddon(
  HotlineCallInfo? info, {
  required String moreLabel,
}) {
  if (info == null) return null;
  return CallScreenAddon(
    callId: info.callId ?? info.ringId,
    below: (_) =>
        HotlineAttorneyCallCard(info: info, incoming: info.callId == null),
    banner: (_) => const HotlineWaitingSlot(),
    onMore: (context, ref) => unawaited(
      showHotlineCallMenu(
        context,
        ref,
        info: info,
        peerId: ref.read(callControllerProvider).peer?.id,
      ),
    ),
    moreLabel: moreLabel,
  );
}

/// Under the name and the status (mockup a4 / a5): while it rings —
/// «Входящий звонок · Горячая линия», the topic and the chips practice ·
/// state · LANGUAGE (gold: the language matters most, owner 18.11); while
/// talking — one quiet line «topic · language».
class HotlineAttorneyCallCard extends ConsumerWidget {
  const HotlineAttorneyCallCard({
    required this.info,
    required this.incoming,
    super.key,
  });

  final HotlineCallInfo info;
  final bool incoming;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final language =
        info.language.isEmpty ? '' : hotlineLanguageLabel(info.language);
    if (!incoming) {
      return Text(
        [
          if (info.topic.isNotEmpty) info.topic,
          if (language.isNotEmpty) language,
        ].join(' · '),
        key: const ValueKey('hotline-call-topic'),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: type.caption.copyWith(
          color: AppCallColors.onStage.withValues(alpha: 0.8),
        ),
      );
    }
    Widget chip(String text, {bool gold = false}) => Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm + 2,
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            color: gold ? colors.gold : AppCallColors.pill,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            text,
            style: type.caption.copyWith(
              color: gold ? colors.onAccent : AppCallColors.onStage,
              fontWeight: gold ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        );
    return Padding(
      key: const ValueKey('hotline-incoming-card'),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            t.t('hotline.call.incoming'),
            textAlign: TextAlign.center,
            style: type.caption.copyWith(
              color: AppCallColors.onStage.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (info.topic.isNotEmpty)
            Text(
              info.topic,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: type.body.copyWith(
                color: AppCallColors.onStage,
                fontWeight: FontWeight.w600,
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: AppSpacing.xs + 2,
            runSpacing: AppSpacing.xs,
            children: [
              if (info.practiceArea.isNotEmpty)
                chip(practiceLabel(ref, info.practiceArea)),
              if (info.state.isNotEmpty) chip(stateName(info.state)),
              if (language.isNotEmpty) chip(language, gold: true),
            ],
          ),
        ],
      ),
    );
  }
}

/// «⋯» in a hotline call (mockup a6): «Принимать звонки», «Профиль
/// клиента», «Заблокировать и пожаловаться».
Future<void> showHotlineCallMenu(
  BuildContext context,
  WidgetRef ref, {
  required HotlineCallInfo info,
  required String? peerId,
}) {
  final t = ref.read(translatorProvider);
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) => Consumer(
      builder: (sheet, sheetRef, _) {
        final colors = Theme.of(sheet).extension<AppColorTokens>()!;
        final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
        final accepting = sheetRef.watch(
          hotlineAttorneyControllerProvider.select((s) => s.accepting),
        );
        final line = ref.read(hotlineAttorneyControllerProvider.notifier);
        final clientId = info.clientId ?? peerId;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AppSheetHandle(),
                SwitchListTile.adaptive(
                  key: const ValueKey('hotline-menu-accepting'),
                  value: accepting,
                  title: Text(
                    t.t('hotline.menu.accepting'),
                    style: type.body.copyWith(color: colors.text),
                  ),
                  onChanged: (v) => unawaited(line.setAccepting(on: v)),
                ),
                if (info.clientUsername != null)
                  AppListRow(
                    key: const ValueKey('hotline-menu-profile'),
                    icon: AppIcons.personOutlineRounded,
                    label: t.t('hotline.menu.profile'),
                    onTap: () {
                      Navigator.of(sheet).pop();
                      // The call minimises (the green bar) and the profile
                      // opens over it (mockup a9).
                      // The push waits for the call page to go (bug 27.11).
                      unawaited(
                        context.popThenPush<void>(
                          AppRoutes.client(info.clientUsername!),
                        ),
                      );
                    },
                  ),
                if (clientId != null && clientId.isNotEmpty)
                  AppListRow(
                    key: const ValueKey('hotline-menu-block'),
                    icon: AppIcons.blockFlipped,
                    label: t.t('hotline.menu.block'),
                    destructive: true,
                    showChevron: false,
                    onTap: () async {
                      Navigator.of(sheet).pop();
                      // A block ends the call at once (WhatsApp); the line
                      // never offers this client to him again (server).
                      await ref.read(blockAndReportProvider)(
                        context,
                        ref,
                        userId: clientId,
                        displayName: info.clientName,
                        onBlocked: () => unawaited(line.endBlocked(info)),
                      );
                    },
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                    AppSpacing.screenSide,
                    AppSpacing.md,
                  ),
                  child: Text(
                    t.t('hotline.menu.note'),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenSide,
                  ),
                  child: AppButton(
                    label: t.t('hotline.menu.close'),
                    variant: AppButtonVariant.secondary,
                    height: 40,
                    onPressed: () => Navigator.of(sheet).pop(),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

/// «Клиент ждёт · язык» while he talks (mockup a7): the same dark card as
/// the call-waiting banner of 1:1 calls (WhatsApp call waiting) — one soft
/// sound, «Отклонить» / «Ответить» («Ответить» ends this call and takes
/// that client).
class HotlineWaitingBanner extends ConsumerStatefulWidget {
  const HotlineWaitingBanner({required this.waiting, super.key});

  final HotlineWaiting waiting;

  @override
  ConsumerState<HotlineWaitingBanner> createState() =>
      _HotlineWaitingBannerState();
}

class _HotlineWaitingBannerState extends ConsumerState<HotlineWaitingBanner> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final w = widget.waiting;
    final line = ref.read(hotlineAttorneyControllerProvider.notifier);
    final waited = DateTime.now().difference(w.waitingSince);
    final time = waited.isNegative ? '0:00' : voiceClock(waited);
    Widget action({
      required Key key,
      required IconData icon,
      required Color fill,
      required String label,
      required VoidCallback onTap,
    }) =>
        Expanded(
          child: Semantics(
            button: true,
            label: label,
            excludeSemantics: true,
            child: Material(
              color: fill,
              shape: const StadiumBorder(),
              child: InkWell(
                key: key,
                customBorder: const StadiumBorder(),
                onTap: onTap,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 44),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: AppSpacing.sm,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AppIcon(icon, size: 18, color: AppCallColors.onStage),
                        const SizedBox(width: AppSpacing.xs),
                        Flexible(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.body.copyWith(
                              color: AppCallColors.onStage,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
    return Material(
      key: const Key('hotline-waiting-banner'),
      color: AppCallColors.sheet,
      elevation: 4,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          AppSpacing.md,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('hotline.waiting.title', {
                'language':
                    w.language.isEmpty ? '' : hotlineLanguageLabel(w.language),
              }),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.body.copyWith(
                color: AppCallColors.onStage,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              t.t('hotline.waiting.line', {
                'topic': w.topic,
                'state': w.state.isEmpty ? '' : stateName(w.state),
                'time': time,
              }),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(
                color: AppCallColors.onStage.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                action(
                  key: const Key('hotline-waiting-decline'),
                  icon: AppIcons.callEndRounded,
                  fill: AppCallColors.end,
                  label: t.t('hotline.waiting.decline'),
                  onTap: line.dismissWaiting,
                ),
                const SizedBox(width: AppSpacing.md),
                action(
                  key: const Key('hotline-waiting-answer'),
                  icon: AppIcons.callRounded,
                  fill: AppCallColors.accept,
                  label: t.t('hotline.waiting.answer'),
                  onTap: () => unawaited(line.answerWaiting()),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// The waiting banner if a client waits for this call (else nothing).
class HotlineWaitingSlot extends ConsumerWidget {
  const HotlineWaitingSlot({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final w =
        ref.watch(hotlineAttorneyControllerProvider.select((s) => s.waiting));
    return AnimatedSwitcher(
      duration: context.reduceMotion ? Duration.zero : CallMotion.quick,
      child: w == null
          ? const SizedBox.shrink()
          : HotlineWaitingBanner(key: ValueKey(w.requestId), waiting: w),
    );
  }
}
