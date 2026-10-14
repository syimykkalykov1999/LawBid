import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-14: the viewer's firm; null when there is none (404).
final myFirmProvider = FutureProvider.autoDispose<api.FirmDto?>((ref) async {
  try {
    return (await guardApiCall(
      () => api.FirmsClient(ref.watch(dioProvider)).myFirm(),
    ))
        .data;
  } on ApiException catch (e) {
    if (e.statusCode == 404) return null;
    rethrow;
  }
});

/// A firm is its lawyers: each keeps their own licence and verification;
/// the firm's states are the union of the verified ones.
class FirmScreen extends ConsumerStatefulWidget {
  const FirmScreen({super.key});

  @override
  ConsumerState<FirmScreen> createState() => _FirmScreenState();
}

class _FirmScreenState extends ConsumerState<FirmScreen> {
  final _name = TextEditingController();
  final _username = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await action();
      ref.invalidate(myFirmProvider);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  api.FirmsClient get _client => api.FirmsClient(ref.read(dioProvider));

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final firm = ref.watch(myFirmProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(title: Text(t.t('firm.title'))),
      body: firm.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: AppButton(
            label: t.t('common.retry'),
            variant: AppButtonVariant.secondary,
            onPressed: () => ref.invalidate(myFirmProvider),
          ),
        ),
        data: (f) => ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children:
              f == null ? _create(t, type, colors) : _firm(f, t, type, colors),
        ),
      ),
    );
  }

  List<Widget> _create(
    Translator t,
    AppTypographyTokens type,
    AppColorTokens colors,
  ) =>
      [
        Text(
          t.t('firm.none'),
          style: type.body.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: _name,
          hintText: t.t('firm.name'),
          maxLength: 120,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: t.t('firm.create'),
          isLoading: _busy,
          onPressed: () => _run(() async {
            await guardApiCall(
              () => _client.createFirm(
                body: api.CreateFirmDto(name: _name.text.trim()),
              ),
            );
          }),
        ),
      ];

  List<Widget> _firm(
    api.FirmDto f,
    Translator t,
    AppTypographyTokens type,
    AppColorTokens colors,
  ) {
    final me = ref.read(sessionControllerProvider)?.sub;
    final mine = f.members.where((m) => m.attorneyId == me).firstOrNull;
    final invited = mine?.status.json == 'invited';
    final isOwner = f.ownerId == me;
    return [
      Text(f.name, style: type.titleMedium.copyWith(color: colors.text)),
      const SizedBox(height: AppSpacing.xs),
      if (invited)
        Text(
          t.t('firm.invited.hint'),
          style: type.bodySmall.copyWith(color: colors.textSecondary),
        )
      else
        Text(
          '${t.t('firm.states')}: '
          '${f.states.isEmpty ? '—' : f.states.join(', ')}',
          style: type.bodySmall.copyWith(color: colors.textSecondary),
        ),
      const SizedBox(height: AppSpacing.md),
      Text(
        t.t('firm.members'),
        style: type.titleMedium.copyWith(color: colors.text),
      ),
      const SizedBox(height: AppSpacing.xs),
      for (final m in f.members)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      [m.firstName, m.lastName]
                          .whereType<String>()
                          .join(' ')
                          .trim(),
                      style: type.body.copyWith(color: colors.text),
                    ),
                    Text(
                      [
                        if (m.role.json == 'owner') t.t('firm.owner'),
                        if (m.status.json == 'invited') t.t('firm.pending'),
                        if (m.states.isNotEmpty) m.states.join(', '),
                      ].join(' · '),
                      style: type.bodySmall.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (isOwner && m.role.json != 'owner')
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                            await guardApiCall(
                              () => _client.removeFirmMember(
                                attorneyId: m.attorneyId,
                              ),
                            );
                          }),
                  child: Text(t.t('firm.remove')),
                ),
            ],
          ),
        ),
      const SizedBox(height: AppSpacing.md),
      if (invited) ...[
        AppButton(
          label: t.t('firm.accept'),
          isLoading: _busy,
          onPressed: () => _run(() async {
            await guardApiCall(() => _client.acceptFirmInvite());
          }),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: t.t('firm.decline'),
          variant: AppButtonVariant.secondary,
          onPressed: _busy ? null : () => _leave(me),
        ),
      ] else if (isOwner) ...[
        AppTextField(
          controller: _username,
          hintText: t.t('firm.invite.username'),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: t.t('firm.invite'),
          isLoading: _busy,
          onPressed: () => _run(() async {
            await guardApiCall(
              () => _client.inviteFirmMember(
                body: api.InviteFirmMemberDto(username: _username.text.trim()),
              ),
            );
            _username.clear();
          }),
        ),
      ] else
        AppButton(
          label: t.t('firm.leave'),
          variant: AppButtonVariant.secondary,
          onPressed: _busy ? null : () => _leave(me),
        ),
    ];
  }

  Future<void> _leave(String? me) => _run(() async {
        if (me == null) return;
        await guardApiCall(() => _client.removeFirmMember(attorneyId: me));
      });
}
