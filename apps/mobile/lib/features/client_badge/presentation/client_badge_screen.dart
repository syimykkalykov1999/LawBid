import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/client_badge/application/client_badge_providers.dart';
import 'package:lawbid/features/client_badge/domain/client_badge_models.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';
import 'package:lawbid/features/verification/presentation/document_source.dart';
import 'package:lawbid/features/verification/verification_providers.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-02 — Settings → "Verify account" for clients: send
/// documents, wait for the admin's approval, then $10/month for the gold
/// badge. The badge shows only while approved AND paid.
class ClientBadgeScreen extends ConsumerStatefulWidget {
  const ClientBadgeScreen({super.key});

  @override
  ConsumerState<ClientBadgeScreen> createState() => _ClientBadgeScreenState();
}

class _ClientBadgeScreenState extends ConsumerState<ClientBadgeScreen>
    with WidgetsBindingObserver {
  static const _maxDocs = 5;
  final List<PickedDocument> _docs = [];
  bool _busy = false;
  String? _progress;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from Stripe's page: show the new state.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) ref.invalidate(clientBadgeProvider);
  }

  Future<void> _add() async {
    final doc =
        await ref.read(documentSourceProvider).pickFile(allowPdf: false);
    if (doc != null && mounted) setState(() => _docs.add(doc));
  }

  Future<void> _submit() async {
    final t = ref.read(translatorProvider);
    final files = ref.read(fileUploadRepositoryProvider);
    final polling = ref.read(scanPollingProvider);
    setState(() => _busy = true);
    try {
      final ids = <String>[];
      for (var i = 0; i < _docs.length; i++) {
        setState(() => _progress = '${i + 1} / ${_docs.length}');
        final id = await files.presignAndUpload(
          _docs[i],
          selfie: false,
          onProgress: (_) {},
          cancellation: UploadCancellation(),
        );
        var scan = await files.confirm(id);
        var polls = 0;
        while (scan == ScanState.pending && polls++ < polling.maxPolls) {
          await Future<void>.delayed(polling.interval);
          scan = await files.scanStatus(id);
        }
        if (scan != ScanState.clean) {
          throw StateError(t.t('cbadge.fileRejected'));
        }
        ids.add(id);
      }
      await ref.read(clientBadgeRepositoryProvider).submit(ids);
      if (!mounted) return;
      setState(_docs.clear);
      ref.invalidate(clientBadgeProvider);
      showAppSnackBar(context, t.t('cbadge.sent'));
    } on Object catch (e) {
      if (mounted) {
        showAppSnackBar(
          context,
          e is StateError ? e.message : errorText(t, e),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _progress = null;
        });
      }
    }
  }

  Future<void> _pay() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final url = await ref.read(clientBadgeRepositoryProvider).checkout();
      if (url.scheme == 'https' || url.scheme == 'http') {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel({required bool cancel}) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref.read(clientBadgeRepositoryProvider).setCancel(cancel: cancel);
      ref.invalidate(clientBadgeProvider);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(clientBadgeProvider);

    Widget card(List<Widget> children) => Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: colors.goldTint,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.goldStroke),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: children,
          ),
        );

    Widget body(ClientBadgeState s) {
      final price = f.currencyFromCents(s.priceCents);
      final sub = s.subscription;
      final until = sub?.currentPeriodEnd;
      if (s.badgeActive) {
        return ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            card([
              Row(
                children: [
                  AppIcon(
                    AppIcons.verifiedRounded,
                    color: colors.gold,
                    size: 32,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      t.t('cbadge.active.title'),
                      style: type.titleMedium.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                sub == null || sub.status == 'comped'
                    ? t.t('cbadge.active.free')
                    : sub.cancelAtPeriodEnd || sub.status == 'canceled'
                        ? t.t('cbadge.active.until', {
                            'date': until == null ? '' : f.date(until),
                          })
                        : t.t('cbadge.active.renews', {
                            'price': price,
                            'date': until == null ? '' : f.date(until),
                          }),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ]),
            if (sub != null && sub.status != 'comped') ...[
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: sub.cancelAtPeriodEnd
                    ? t.t('cbadge.resume')
                    : t.t('cbadge.cancel'),
                variant: AppButtonVariant.secondary,
                isLoading: _busy,
                onPressed: () => _cancel(cancel: !sub.cancelAtPeriodEnd),
              ),
            ],
          ],
        );
      }
      if (s.status == ClientBadgeStatus.pending) {
        return ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            card([
              Text(
                t.t('cbadge.pending.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('cbadge.pending.text'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ]),
          ],
        );
      }
      if (s.canSubscribe) {
        return ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            card([
              Text(
                t.t('cbadge.approved.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('cbadge.approved.text', {'price': price}),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ]),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: t.t('cbadge.pay', {'price': price}),
              icon: AppIcons.verifiedRounded,
              isLoading: _busy,
              onPressed: _pay,
            ),
          ],
        );
      }
      // none · rejected · revoked: send documents.
      final reason = s.status == ClientBadgeStatus.rejected
          ? s.rejectReason
          : s.status == ClientBadgeStatus.revoked
              ? s.revokeReason
              : null;
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.screenSide),
        children: [
          card([
            Row(
              children: [
                AppIcon(AppIcons.verifiedRounded, color: colors.gold, size: 28),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    t.t('cbadge.title'),
                    style: type.titleMedium.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('cbadge.lead'),
              style: type.body.copyWith(color: colors.textSecondary),
            ),
          ]),
          if (reason != null && reason.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t(
                s.status == ClientBadgeStatus.rejected
                    ? 'cbadge.rejected'
                    : 'cbadge.revoked',
                {'reason': reason},
              ),
              style: type.bodySmall.copyWith(color: colors.dangerText),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          Text(
            t.t('cbadge.docs'),
            style: type.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('cbadge.docs.hint'),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          for (var i = 0; i < _docs.length; i++)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadii.card),
                child: Image.memory(
                  _docs[i].bytes,
                  width: 48,
                  height: 48,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => AppIcon(
                    AppIcons.articleOutlined,
                    color: colors.textSecondary,
                  ),
                ),
              ),
              title: Text(
                _docs[i].name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.body.copyWith(color: colors.text),
              ),
              trailing: AppIconButton(
                icon: AppIcon(AppIcons.closeRounded, color: colors.text),
                semanticLabel: t.t('common.remove'),
                onPressed:
                    _busy ? null : () => setState(() => _docs.removeAt(i)),
              ),
            ),
          if (_docs.length < _maxDocs)
            AppButton(
              label: t.t('cbadge.addPhoto'),
              icon: AppIcons.addRounded,
              variant: AppButtonVariant.secondary,
              onPressed: _busy ? null : _add,
            ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            t.t('cbadge.price', {'price': price}),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: _progress == null
                ? t.t('cbadge.submit')
                : t.t('cbadge.uploading', {'n': _progress!}),
            isLoading: _busy,
            onPressed: _docs.isEmpty ? null : _submit,
          ),
        ],
      );
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('cbadge.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: async.when(
          loading: () =>
              Center(child: CircularProgressIndicator(color: colors.gold)),
          error: (e, _) => AppErrorState(
            message: errorText(t, e),
            retryLabel: t.t('error.retry'),
            onRetry: () => ref.invalidate(clientBadgeProvider),
          ),
          data: body,
        ),
      ),
    );
  }
}
