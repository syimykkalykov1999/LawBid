import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/app_links.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-02 — why and until when the account is blocked, from the
/// server's `403 ACCOUNT_SUSPENDED` (`details.reason`, `details.until`).
class SuspensionInfo {
  const SuspensionInfo({this.reason, this.until});

  final String? reason;

  /// null = no end date (until support lifts it).
  final DateTime? until;
}

/// Set by [AccountSuspendedInterceptor] the moment ANY request is refused
/// with ACCOUNT_SUSPENDED (sign-in, refresh, or a call made while blocked).
class SuspensionController extends Notifier<SuspensionInfo?> {
  @override
  SuspensionInfo? build() => null;

  // ignore: use_setters_to_change_properties
  void show(SuspensionInfo info) => state = info;

  void clear() => state = null;
}

final suspensionProvider =
    NotifierProvider<SuspensionController, SuspensionInfo?>(
  SuspensionController.new,
);

class AccountSuspendedInterceptor extends Interceptor {
  AccountSuspendedInterceptor(this._ref);

  final Ref _ref;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final e = ApiException.fromDioException(err);
    if (e.code == ApiErrorCodes.accountSuspended) {
      final until = e.details?['until'];
      final reason = e.details?['reason'];
      _ref.read(suspensionProvider.notifier).show(
            SuspensionInfo(
              reason: reason is String && reason.trim().isNotEmpty
                  ? reason.trim()
                  : null,
              until: until is String ? DateTime.tryParse(until) : null,
            ),
          );
    }
    handler.next(err);
  }
}

/// Covers the whole app with "Account blocked" (reason, end date, how to
/// reach support) when the server says so. The only ways out: contact
/// support, or leave the blocked account (back to the sign-in screen).
class AccountSuspendedGate extends ConsumerWidget {
  const AccountSuspendedGate({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final info = ref.watch(suspensionProvider);
    if (info == null || Theme.of(context).extension<AppColorTokens>() == null) {
      return child;
    }
    return Stack(
      children: [
        child,
        Positioned.fill(child: _SuspendedScreen(info: info)),
      ],
    );
  }
}

class _SuspendedScreen extends ConsumerWidget {
  const _SuspendedScreen({required this.info});

  final SuspensionInfo info;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final until = info.until;
    return ScaffoldMessenger(
      child: PopScope(
        canPop: false,
        child: Scaffold(
          key: const Key('account.suspended'),
          backgroundColor: colors.bg,
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
              ),
              // Scrollable so a long reason / translation on a small
              // screen never overflows the column.
              child: Center(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: AppIcon(
                          AppIcons.shieldRounded,
                          size: 56,
                          color: colors.dangerText,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Semantics(
                        header: true,
                        child: Text(
                          t.t('account.suspended.title'),
                          textAlign: TextAlign.center,
                          style: type.titleLarge.copyWith(color: colors.text),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        until == null
                            ? t.t('account.suspended.noEnd')
                            : t.t(
                                'account.suspended.until',
                                {'date': f.date(until)},
                              ),
                        textAlign: TextAlign.center,
                        style: type.body.copyWith(color: colors.textSecondary),
                      ),
                      if (info.reason != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        Container(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          decoration: BoxDecoration(
                            color: colors.surface,
                            borderRadius: BorderRadius.circular(AppRadii.card),
                            border: Border.all(color: colors.border),
                          ),
                          child: Text(
                            t.t('account.suspended.reason', {
                              'reason': info.reason!,
                            }),
                            style: type.body.copyWith(color: colors.text),
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.xl),
                      AppButton(
                        label: t.t('account.suspended.contact'),
                        icon: AppIcons.supportAgentRounded,
                        onPressed: () => launchUrl(
                          Uri.parse(kWebsiteUrl),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      AppButton(
                        label: t.t('account.suspended.leave'),
                        variant: AppButtonVariant.secondary,
                        onPressed: () async {
                          await ref
                              .read(sessionControllerProvider.notifier)
                              .clear();
                          ref.read(suspensionProvider.notifier).clear();
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
