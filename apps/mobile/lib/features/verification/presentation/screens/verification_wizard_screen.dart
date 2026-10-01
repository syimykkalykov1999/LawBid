import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/verification/application/verification_overview_controller.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/presentation/document_source.dart';
import 'package:lawbid/features/verification/presentation/widgets/license_sheet.dart';
import 'package:lawbid/features/verification/presentation/widgets/wizard_stepper.dart';
import 'package:lawbid/features/verification/presentation/widgets/wizard_steps.dart';

/// `/verification/wizard` — the verification wizard (docs/03 §8 steps
/// 1–5, stage 3.8): intro → licenses (several states) → identity document
/// (front/back) → selfie → review & submit. Everything is saved on the
/// server as the draft, so closing the app resumes where it stopped. Also
/// used to answer `needs_more_info` (starts at review, only additions).
class VerificationWizardScreen extends ConsumerStatefulWidget {
  const VerificationWizardScreen({super.key});

  @override
  ConsumerState<VerificationWizardScreen> createState() =>
      _VerificationWizardScreenState();
}

class _VerificationWizardScreenState
    extends ConsumerState<VerificationWizardScreen> {
  final _comment = TextEditingController();
  bool _commentLoaded = false;
  Timer? _commentSave;
  String? _stepError;
  String? _blockMessage;
  bool _submitting = false;

  VerificationWizardController get _c =>
      ref.read(verificationWizardProvider.notifier);
  Translator get _t => ref.read(translatorProvider);

  @override
  void dispose() {
    _commentSave?.cancel();
    _comment.dispose();
    super.dispose();
  }

  void _toast(Object error) {
    if (mounted) showAppSnackBar(context, errorText(_t, error));
  }

  Future<bool> _confirm(String title, String body, String action) async {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(_t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(action, style: TextStyle(color: colors.dangerText)),
          ),
        ],
      ),
    );
    return (ok ?? false) && mounted;
  }

  Future<void> _addFile(DocSlot slot, FileOrigin origin) async {
    final source = ref.read(documentSourceProvider);
    final PickedDocument? doc;
    switch (origin) {
      case FileOrigin.cameraCard:
        doc = await source.capture(context, CaptureGuide.card);
      case FileOrigin.cameraDocument:
        doc = await source.capture(context, CaptureGuide.document);
      case FileOrigin.cameraSelfie:
        doc = await source.capture(context, CaptureGuide.selfie);
      case FileOrigin.library:
        doc = await source.pickFile(allowPdf: false);
      case FileOrigin.file:
        doc = await source.pickFile(allowPdf: true);
    }
    if (doc == null || !mounted) return;
    try {
      setState(() => _blockMessage = null);
      _c.upload(slot, doc);
    } on Object catch (e) {
      _toast(e);
    }
  }

  Future<void> _removeDocument(VerificationDocument d) async {
    try {
      await _c.removeDocument(d.id);
    } on Object catch (e) {
      _toast(e);
    }
  }

  Future<void> _removeLicense(VerificationLicense l) async {
    final ok = await _confirm(
      _t.t('verification.license.remove.title'),
      _t.t('verification.license.remove.body', {'state': l.stateName}),
      _t.t('verification.license.remove.action'),
    );
    if (!ok) return;
    try {
      await _c.removeLicense(l);
    } on Object catch (e) {
      _toast(e);
    }
  }

  Future<void> _addLicense(WizardState s) async {
    await AddLicenseSheet.show(
      context,
      s.request.pendingLicenses.map((l) => l.stateCode).toSet(),
    );
    if (mounted) setState(() => _stepError = null);
  }

  void _onCommentChanged(String value) {
    _commentSave?.cancel();
    _commentSave = Timer(const Duration(milliseconds: 800), () {
      _c.saveComment(value.trim());
    });
  }

  /// Validates the current step before moving on (drafts only; an answer
  /// to an info request may add anything or nothing).
  String? _stepProblem(WizardState s) {
    if (s.isSupplement) return null;
    final r = s.request;
    switch (s.step) {
      case WizardStep.licenses:
        if (r.pendingLicenses.isEmpty)
          return _t.t('verification.missing.license');
        if (!r.licensesComplete) return _t.t('verification.licenses.needDocs');
      case WizardStep.identity:
        final front =
            r.docsFor(DocSlot.identity(s.idType, DocSide.front)).isNotEmpty;
        final back =
            r.docsFor(DocSlot.identity(s.idType, DocSide.back)).isNotEmpty;
        if (!front) return _t.t('verification.missing.id');
        if (s.idType.needsBack && !back)
          return _t.t('verification.missing.idBack');
      case WizardStep.selfie:
        if (!r.selfieComplete) return _t.t('verification.missing.selfie');
      case WizardStep.intro:
      case WizardStep.review:
        break;
    }
    return null;
  }

  void _next(WizardState s) {
    final problem = _stepProblem(s);
    setState(() => _stepError = problem);
    if (problem == null) _c.next();
  }

  Future<void> _submit(WizardState s) async {
    final blocker = s.blocker;
    if (blocker != null) {
      setState(
        () => _blockMessage = _t.t(
          blocker == SubmitBlocker.uploadsInProgress
              ? 'verification.submit.blocked.uploading'
              : 'verification.submit.blocked.failed',
        ),
      );
      return;
    }
    if (s.localMissing.isNotEmpty) {
      setState(
          () => _blockMessage = _t.t('verification.submit.blocked.missing'));
      return;
    }
    setState(() {
      _blockMessage = null;
      _submitting = true;
    });
    _commentSave?.cancel();
    try {
      final sent = await _c.submit(_comment.text.trim());
      if (sent == null || !mounted) return;
      ref.invalidate(verificationOverviewProvider);
      showAppSnackBar(context, _t.t('verification.submit.success'));
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(AppRoutes.verification);
      }
    } on Object catch (e) {
      if (mounted) setState(() => _blockMessage = errorText(_t, e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _back() {
    setState(() => _stepError = null);
    if (!_c.back()) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final async = ref.watch(verificationWizardProvider);
    ref.listen(connectivityStatusProvider, (previous, next) {
      final current = ref.read(verificationWizardProvider);
      if ((previous?.isOffline ?? false) && next.isOnline && current.hasError) {
        ref.invalidate(verificationWizardProvider);
      }
    });
    final data = async.value;
    if (data != null && !_commentLoaded) {
      _commentLoaded = true;
      _comment.text = data.request.applicantComment ?? '';
    }
    final atFirst = data == null || data.stepIndex <= 0;

    return PopScope(
      canPop: atFirst,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          title: Text(t.t('verification.title')),
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: _back,
          ),
          actions: [
            if (!atFirst)
              AppIconButton(
                semanticLabel: t.t('verification.wizard.close'),
                onPressed: () => Navigator.of(context).maybePop(),
                icon: AppIcon(AppIcons.closeRounded, color: colors.text),
              ),
          ],
        ),
        body: AnimatedSwitcher(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          child: switch (async) {
            AsyncData(:final value) => KeyedSubtree(
                key: const ValueKey('wizard-data'),
                child: _wizard(t, value),
              ),
            AsyncError(:final error) => KeyedSubtree(
                key: const ValueKey('wizard-error'),
                child: isOfflineError(error)
                    ? AppOfflineState(
                        title: t.t('offline.title'),
                        message: t.t('offline.message'),
                        action: AppButton(
                          label: t.t('error.retry'),
                          icon: AppIcons.refreshRounded,
                          variant: AppButtonVariant.secondary,
                          height: AppSizes.touchTarget,
                          onPressed: () =>
                              ref.invalidate(verificationWizardProvider),
                        ),
                      )
                    : AppErrorState(
                        title: t.t('verification.wizard.error'),
                        message: errorText(t, error),
                        retryLabel: t.t('error.retry'),
                        onRetry: () =>
                            ref.invalidate(verificationWizardProvider),
                      ),
              ),
            _ => const _WizardSkeleton(key: ValueKey('wizard-loading')),
          },
        ),
      ),
    );
  }

  Widget _wizard(Translator t, WizardState s) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final labels = [
      for (final step in s.steps) t.t('verification.step.${step.name}'),
    ];
    final actions = StepActions(
      addFile: _addFile,
      removeDocument: _removeDocument,
      retry: (u) => _c.retry(u.localId),
      cancel: (u) => _c.cancel(u.localId),
      addLicense: () => _addLicense(s),
      removeLicense: _removeLicense,
      selectIdType: _c.selectIdType,
      goTo: (step) {
        setState(() => _stepError = null);
        _c.goTo(step);
      },
    );
    final body = switch (s.step) {
      WizardStep.intro => IntroStep(t: t, identityRequired: s.identityRequired),
      WizardStep.licenses => LicensesStep(t: t, state: s, actions: actions),
      WizardStep.identity => IdentityStep(t: t, state: s, actions: actions),
      WizardStep.selfie => SelfieStep(t: t, state: s, actions: actions),
      WizardStep.review => ReviewStep(
          t: t,
          state: s,
          actions: actions,
          comment: _comment,
          onCommentChanged: _onCommentChanged,
          blockMessage: _blockMessage,
        ),
    };
    final isReview = s.step == WizardStep.review;
    final reduce = context.reduceMotion;

    return Column(
      children: [
        WizardStepper(
          labels: labels,
          current: s.stepIndex,
          stepOfLabel: t.t('common.stepOf', {
            'current': '${s.stepIndex + 1}',
            'total': '${s.steps.length}',
          }),
          onTapStep: (i) => actions.goTo(s.steps[i]),
        ),
        Divider(height: 1, color: colors.border),
        Expanded(
          child: AnimatedSwitcher(
            duration: reduce ? Duration.zero : AppMotion.stepSwitch,
            switchInCurve: AppMotion.enterCurve,
            switchOutCurve: AppMotion.exitCurve,
            transitionBuilder: (child, animation) => FadeTransition(
              opacity: animation,
              child: SlideTransition(
                position: Tween(
                  begin: const Offset(AppMotion.pageSlideFraction, 0),
                  end: Offset.zero,
                ).animate(animation),
                child: child,
              ),
            ),
            child: KeyedSubtree(key: ValueKey(s.step), child: body),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.md,
                AppSpacing.screenSide,
                AppSpacing.md,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_stepError != null) ...[
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        _stepError!,
                        textAlign: TextAlign.center,
                        style: Theme.of(context)
                            .extension<AppTypographyTokens>()!
                            .bodySmall
                            .copyWith(color: colors.dangerText),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  AppButton(
                    label: switch (s.step) {
                      WizardStep.intro => t.t('verification.intro.start'),
                      WizardStep.review => t.t(
                          s.isSupplement
                              ? 'verification.submit.supplement'
                              : 'verification.submit',
                        ),
                      _ => t.t('verification.next'),
                    },
                    icon: isReview ? AppIcons.gavelRounded : null,
                    isLoading: _submitting,
                    onPressed: isReview ? () => _submit(s) : () => _next(s),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _WizardSkeleton extends StatelessWidget {
  const _WizardSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(AppSpacing.screenSide),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppSkeleton(height: AppSpacing.xxl),
            SizedBox(height: AppSpacing.xl),
            AppSkeleton(width: 220, height: AppSpacing.xl),
            SizedBox(height: AppSpacing.md),
            AppSkeleton(),
            SizedBox(height: AppSpacing.xl),
            AppSkeletonCard(),
            SizedBox(height: AppSpacing.lg),
            AppSkeletonCard(),
          ],
        ),
      );
}
