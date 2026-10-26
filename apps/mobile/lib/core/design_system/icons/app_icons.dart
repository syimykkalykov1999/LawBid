import 'package:flutter/widgets.dart';

/// Owner 2026-10-20: icons were too thin and «childish» — now Phosphor
/// **Fill** (solid, rich) for object glyphs and **Bold** for pure-line glyphs
/// (arrows, close, add, search) and the inactive half of toggles; Light is
/// no longer used. Same MIT set (assets/fonts), same codepoints. Active
/// states (liked, saved, rated, verified, playing, selected tab) use Fill.
/// Names keep the old Material names so call sites read the same.
abstract final class AppIcons {
  static const boldFamily = 'PhosphorBold';
  static const fillFamily = 'PhosphorFill';

  static const IconData accountBalanceOutlined = IconData(
    0xe0b4,
    fontFamily: fillFamily,
  );
  static const IconData accountBalanceWalletRounded = IconData(
    0xe68a,
    fontFamily: fillFamily,
  );
  static const IconData addAPhotoOutlined = IconData(
    0xec58,
    fontFamily: boldFamily,
  );
  static const IconData addCall = IconData(0xec56, fontFamily: boldFamily);
  static const IconData addLocationAltOutlined = IconData(
    0xe314,
    fontFamily: boldFamily,
  );
  static const IconData addPhotoAlternateOutlined = IconData(
    0xe2cc,
    fontFamily: boldFamily,
  );
  static const IconData addRounded = IconData(0xe3d4, fontFamily: boldFamily);
  static const IconData adminPanelSettingsOutlined = IconData(
    0xe4cc,
    fontFamily: fillFamily,
  );
  static const IconData alternateEmailRounded = IconData(
    0xe0ac,
    fontFamily: boldFamily,
  );
  static const IconData apartmentRounded = IconData(
    0xe102,
    fontFamily: fillFamily,
  );
  static const IconData arrowDownwardRounded = IconData(
    0xe03e,
    fontFamily: boldFamily,
  );
  static const IconData arrowForwardRounded = IconData(
    0xe06c,
    fontFamily: boldFamily,
  );
  static const IconData arrowUpwardRounded = IconData(
    0xe08e,
    fontFamily: boldFamily,
  );
  static const IconData article = IconData(0xe0a8, fontFamily: fillFamily);
  static const IconData articleOutlined = IconData(
    0xe0a8,
    fontFamily: fillFamily,
  );
  static const IconData articleRounded = IconData(
    0xe0a8,
    fontFamily: fillFamily,
  );
  static const IconData attachFileRounded = IconData(
    0xe39a,
    fontFamily: boldFamily,
  );
  static const IconData autoAwesomeOutlined = IconData(
    0xe6a2,
    fontFamily: fillFamily,
  );
  static const IconData autoModeRounded = IconData(
    0xe094,
    fontFamily: boldFamily,
  );
  static const IconData badgeOutlined = IconData(
    0xe6f6,
    fontFamily: fillFamily,
  );
  static const IconData balanceRounded = IconData(
    0xe750,
    fontFamily: fillFamily,
  );
  static const IconData blockFlipped = IconData(0xe3de, fontFamily: fillFamily);
  static const IconData blockRounded = IconData(0xe3de, fontFamily: fillFamily);
  static const IconData bookmarkBorderRounded = IconData(
    0xe0ea,
    fontFamily: boldFamily,
  );
  static const IconData bookmarkOutlineRounded = IconData(
    0xe0ea,
    fontFamily: boldFamily,
  );
  static const IconData bookmarkRemoveOutlined = IconData(
    0xe0ea,
    fontFamily: boldFamily,
  );
  static const IconData bookmarkRounded = IconData(
    0xe0ea,
    fontFamily: fillFamily,
  );
  static const IconData businessCenterRounded = IconData(
    0xe0ee,
    fontFamily: boldFamily,
  );
  static const IconData call = IconData(0xe3b8, fontFamily: fillFamily);
  static const IconData callEndRounded = IconData(
    0xe3bc,
    fontFamily: fillFamily,
  );
  static const IconData callMadeRounded = IconData(
    0xe3c0,
    fontFamily: boldFamily,
  );
  static const IconData callMissedRounded = IconData(
    0xe3c4,
    fontFamily: fillFamily,
  );
  static const IconData callOutlined = IconData(0xe3b8, fontFamily: fillFamily);
  static const IconData callReceivedRounded = IconData(
    0xe3be,
    fontFamily: boldFamily,
  );
  static const IconData callRounded = IconData(0xe3b8, fontFamily: fillFamily);
  static const IconData campaignOutlined = IconData(
    0xe324,
    fontFamily: fillFamily,
  );
  static const IconData campaignRounded = IconData(
    0xe324,
    fontFamily: fillFamily,
  );
  static const IconData cancelOutlined = IconData(
    0xe4f8,
    fontFamily: boldFamily,
  );
  static const IconData cancelRounded = IconData(
    0xe4f8,
    fontFamily: fillFamily,
  );
  static const IconData chatBubbleOutlineRounded = IconData(
    0xe168,
    fontFamily: boldFamily,
  );
  static const IconData chatBubbleRounded = IconData(
    0xe168,
    fontFamily: fillFamily,
  );
  static const IconData check = IconData(0xe182, fontFamily: boldFamily);
  static const IconData checkCircleOutlineRounded = IconData(
    0xe184,
    fontFamily: boldFamily,
  );
  static const IconData checkCircleRounded = IconData(
    0xe184,
    fontFamily: fillFamily,
  );
  static const IconData checkRounded = IconData(0xe182, fontFamily: boldFamily);
  static const IconData chevronRightRounded = IconData(
    0xe13a,
    fontFamily: boldFamily,
  );

  /// Owner 2026-10-19: the photo framing's «original / square» switch.
  static const IconData cornersOut = IconData(0xe1d0, fontFamily: fillFamily);
  static const IconData closeRounded = IconData(0xe4f6, fontFamily: boldFamily);
  static const IconData cloudUploadOutlined = IconData(
    0xe1ae,
    fontFamily: fillFamily,
  );
  static const IconData collectionsRounded = IconData(
    0xe836,
    fontFamily: fillFamily,
  );
  static const IconData computer = IconData(0xe560, fontFamily: fillFamily);
  static const IconData computerRounded = IconData(
    0xe560,
    fontFamily: fillFamily,
  );
  static const IconData constructionRounded = IconData(
    0xed46,
    fontFamily: fillFamily,
  );
  static const IconData contactPhoneOutlined = IconData(
    0xe6f8,
    fontFamily: fillFamily,
  );
  static const IconData contrastRounded = IconData(
    0xe18c,
    fontFamily: fillFamily,
  );
  static const IconData creditCardRounded = IconData(
    0xe1d2,
    fontFamily: fillFamily,
  );
  static const IconData darkModeOutlined = IconData(
    0xe330,
    fontFamily: fillFamily,
  );
  static const IconData deleteForeverRounded = IconData(
    0xe4a6,
    fontFamily: fillFamily,
  );
  static const IconData deleteOutlineRounded = IconData(
    0xe4a6,
    fontFamily: fillFamily,
  );
  static const IconData descriptionOutlined = IconData(
    0xe23a,
    fontFamily: fillFamily,
  );
  static const IconData descriptionRounded = IconData(
    0xe23a,
    fontFamily: fillFamily,
  );
  static const IconData devicesOther = IconData(0xeba4, fontFamily: fillFamily);
  static const IconData devicesRounded = IconData(
    0xeba4,
    fontFamily: fillFamily,
  );
  static const IconData diamondOutlined = IconData(
    0xe1ec,
    fontFamily: fillFamily,
  );
  static const IconData directionsCarFilledRounded = IconData(
    0xe112,
    fontFamily: fillFamily,
  );
  static const IconData directionsCarOutlined = IconData(
    0xe112,
    fontFamily: fillFamily,
  );
  static const IconData diversity3Rounded = IconData(
    0xe68e,
    fontFamily: fillFamily,
  );
  static const IconData doNotDisturbOnOutlined = IconData(
    0xe32c,
    fontFamily: fillFamily,
  );
  static const IconData doneAllRounded = IconData(
    0xe53a,
    fontFamily: boldFamily,
  );
  static const IconData doneRounded = IconData(0xe182, fontFamily: boldFamily);
  static const IconData downloadRounded = IconData(
    0xe20c,
    fontFamily: boldFamily,
  );
  static const IconData dragIndicatorRounded = IconData(
    0xeae2,
    fontFamily: fillFamily,
  );
  static const IconData drawOutlined = IconData(0xe3b2, fontFamily: fillFamily);
  static const IconData dynamicFeedRounded = IconData(
    0xe466,
    fontFamily: fillFamily,
  );
  static const IconData ecoRounded = IconData(0xe2da, fontFamily: fillFamily);
  static const IconData editNoteRounded = IconData(
    0xe34c,
    fontFamily: fillFamily,
  );
  static const IconData editOutlined = IconData(0xe3b4, fontFamily: fillFamily);
  static const IconData elderlyRounded = IconData(
    0xe73a,
    fontFamily: fillFamily,
  );
  static const IconData engineeringRounded = IconData(
    0xed46,
    fontFamily: fillFamily,
  );
  static const IconData errorOutlineRounded = IconData(
    0xe4e2,
    fontFamily: fillFamily,
  );
  static const IconData eventAvailableOutlined = IconData(
    0xe712,
    fontFamily: fillFamily,
  );
  static const IconData eventAvailableRounded = IconData(
    0xe712,
    fontFamily: fillFamily,
  );
  static const IconData eventNoteOutlined = IconData(
    0xe7b4,
    fontFamily: fillFamily,
  );
  static const IconData eventNoteRounded = IconData(
    0xe7b4,
    fontFamily: fillFamily,
  );
  static const IconData eventOutlined = IconData(
    0xe10a,
    fontFamily: fillFamily,
  );
  static const IconData eventRepeatRounded = IconData(
    0xe714,
    fontFamily: fillFamily,
  );
  static const IconData expandMoreRounded = IconData(
    0xe136,
    fontFamily: boldFamily,
  );
  static const IconData faceOutlined = IconData(0xe436, fontFamily: fillFamily);
  static const IconData faceRetouchingNaturalOutlined = IconData(
    0xe6fc,
    fontFamily: fillFamily,
  );
  static const IconData factCheckOutlined = IconData(
    0xeadc,
    fontFamily: fillFamily,
  );
  static const IconData factCheckRounded = IconData(
    0xeadc,
    fontFamily: fillFamily,
  );
  static const IconData familyRestroomRounded = IconData(
    0xe68e,
    fontFamily: fillFamily,
  );
  static const IconData favoriteBorderRounded = IconData(
    0xe2a8,
    fontFamily: boldFamily,
  );
  static const IconData favoriteRounded = IconData(
    0xe2a8,
    fontFamily: fillFamily,
  );
  static const IconData filterAltOffOutlined = IconData(
    0xe26c,
    fontFamily: boldFamily,
  );
  static const IconData fingerprint = IconData(0xe23e, fontFamily: fillFamily);
  static const IconData flagOutlined = IconData(0xe244, fontFamily: fillFamily);
  static const IconData flightTakeoffRounded = IconData(
    0xe504,
    fontFamily: fillFamily,
  );
  static const IconData flipOutlined = IconData(0xed6a, fontFamily: fillFamily);
  static const IconData folder = IconData(0xe24a, fontFamily: fillFamily);
  static const IconData folderOpenRounded = IconData(
    0xe256,
    fontFamily: fillFamily,
  );
  static const IconData folderOutlined = IconData(
    0xe24a,
    fontFamily: boldFamily,
  );
  static const IconData folderRounded = IconData(
    0xe24a,
    fontFamily: fillFamily,
  );
  static const IconData folderZipOutlined = IconData(
    0xe958,
    fontFamily: fillFamily,
  );
  static const IconData formatQuoteRounded = IconData(
    0xe660,
    fontFamily: fillFamily,
  );
  static const IconData forumOutlined = IconData(
    0xe17e,
    fontFamily: fillFamily,
  );
  static const IconData gavel = IconData(0xea32, fontFamily: fillFamily);
  static const IconData gavelOutlined = IconData(
    0xea32,
    fontFamily: fillFamily,
  );
  static const IconData gavelRounded = IconData(0xea32, fontFamily: fillFamily);
  static const IconData gppBadOutlined = IconData(
    0xe412,
    fontFamily: fillFamily,
  );
  static const IconData gridOnRounded = IconData(
    0xe464,
    fontFamily: fillFamily,
  );
  static const IconData gridViewRounded = IconData(
    0xe464,
    fontFamily: fillFamily,
  );
  static const IconData groups2Outlined = IconData(
    0xe68e,
    fontFamily: fillFamily,
  );
  static const IconData groups2Rounded = IconData(
    0xe68e,
    fontFamily: fillFamily,
  );
  static const IconData groupsOutlined = IconData(
    0xe68e,
    fontFamily: fillFamily,
  );
  static const IconData handshakeOutlined = IconData(
    0xe582,
    fontFamily: fillFamily,
  );
  static const IconData healthAndSafetyRounded = IconData(
    0xe570,
    fontFamily: fillFamily,
  );
  static const IconData helpOutlineRounded = IconData(
    0xe3e8,
    fontFamily: fillFamily,
  );
  static const IconData hideSourceRounded = IconData(
    0xe224,
    fontFamily: fillFamily,
  );
  static const IconData historyEduRounded = IconData(
    0xeb7a,
    fontFamily: fillFamily,
  );
  static const IconData historyRounded = IconData(
    0xe1a0,
    fontFamily: fillFamily,
  );
  static const IconData homeOutlined = IconData(0xe2c2, fontFamily: boldFamily);
  static const IconData copyOutlined = IconData(0xe1ca, fontFamily: fillFamily);
  static const IconData forwardRounded = IconData(
    0xed52,
    fontFamily: fillFamily,
  );
  static const IconData selectChecksRounded = IconData(
    0xeadc,
    fontFamily: fillFamily,
  );
  static const IconData homeRounded = IconData(0xe2c2, fontFamily: fillFamily);
  static const IconData homeWorkRounded = IconData(
    0xe2c4,
    fontFamily: fillFamily,
  );
  static const IconData hourglassEmptyRounded = IconData(
    0xe2b2,
    fontFamily: fillFamily,
  );
  static const IconData hourglassTopRounded = IconData(
    0xe2b4,
    fontFamily: fillFamily,
  );
  static const IconData imageNotSupportedOutlined = IconData(
    0xe7a8,
    fontFamily: fillFamily,
  );
  static const IconData imageOutlined = IconData(
    0xe2ca,
    fontFamily: fillFamily,
  );
  static const IconData inboxOutlined = IconData(
    0xe4aa,
    fontFamily: fillFamily,
  );
  static const IconData infoOutlineRounded = IconData(
    0xe2ce,
    fontFamily: fillFamily,
  );
  static const IconData insertDriveFileRounded = IconData(
    0xe230,
    fontFamily: fillFamily,
  );
  static const IconData insightsOutlined = IconData(
    0xe156,
    fontFamily: fillFamily,
  );
  static const IconData inventory2Outlined = IconData(
    0xe00c,
    fontFamily: fillFamily,
  );
  static const IconData iosShareRounded = IconData(
    0xeaf0,
    fontFamily: fillFamily,
  );
  static const IconData keyOffRounded = IconData(
    0xe2d6,
    fontFamily: fillFamily,
  );
  static const IconData language = IconData(0xe288, fontFamily: fillFamily);
  static const IconData languageRounded = IconData(
    0xe288,
    fontFamily: fillFamily,
  );
  static const IconData lightModeOutlined = IconData(
    0xe472,
    fontFamily: fillFamily,
  );
  static const IconData lightbulbRounded = IconData(
    0xe2dc,
    fontFamily: fillFamily,
  );
  static const IconData linkOffRounded = IconData(
    0xe2e4,
    fontFamily: boldFamily,
  );
  static const IconData linkRounded = IconData(0xe2e2, fontFamily: boldFamily);
  static const IconData localOfferOutlined = IconData(
    0xe478,
    fontFamily: fillFamily,
  );
  static const IconData localPoliceRounded = IconData(
    0xec4a,
    fontFamily: fillFamily,
  );
  static const IconData locationOnOutlined = IconData(
    0xe316,
    fontFamily: fillFamily,
  );
  static const IconData lockOpenRounded = IconData(
    0xe306,
    fontFamily: fillFamily,
  );
  static const IconData lockOutlineRounded = IconData(
    0xe2fa,
    fontFamily: fillFamily,
  );
  static const IconData lockPersonOutlined = IconData(
    0xe2fe,
    fontFamily: fillFamily,
  );
  static const IconData loginRounded = IconData(0xe428, fontFamily: fillFamily);
  static const IconData logoutRounded = IconData(
    0xe42a,
    fontFamily: fillFamily,
  );
  static const IconData mailOutlineRounded = IconData(
    0xe218,
    fontFamily: fillFamily,
  );
  static const IconData manageAccountsOutlined = IconData(
    0xe4cc,
    fontFamily: fillFamily,
  );
  static const IconData mapOutlined = IconData(0xe31a, fontFamily: fillFamily);
  static const IconData markEmailReadOutlined = IconData(
    0xe216,
    fontFamily: fillFamily,
  );
  static const IconData markEmailUnreadOutlined = IconData(
    0xe218,
    fontFamily: fillFamily,
  );
  static const IconData medicalServicesRounded = IconData(
    0xe56e,
    fontFamily: fillFamily,
  );
  static const IconData menuBookOutlined = IconData(
    0xe0e6,
    fontFamily: boldFamily,
  );
  static const IconData micOffRounded = IconData(
    0xe328,
    fontFamily: fillFamily,
  );
  static const IconData micRounded = IconData(0xe326, fontFamily: fillFamily);
  static const IconData militaryTechRounded = IconData(
    0xe320,
    fontFamily: fillFamily,
  );
  static const IconData modeCommentOutlined = IconData(
    0xe172,
    fontFamily: boldFamily,
  );
  static const IconData modeCommentRounded = IconData(
    0xe172,
    fontFamily: fillFamily,
  );
  static const IconData moreHorizRounded = IconData(
    0xe1fe,
    fontFamily: boldFamily,
  );
  static const IconData moreVertRounded = IconData(
    0xe208,
    fontFamily: boldFamily,
  );
  static const IconData newspaperRounded = IconData(
    0xe344,
    fontFamily: fillFamily,
  );
  static const IconData nightlightRound = IconData(
    0xe330,
    fontFamily: fillFamily,
  );
  static const IconData noPhotographyOutlined = IconData(
    0xe110,
    fontFamily: fillFamily,
  );
  static const IconData noteAddOutlined = IconData(
    0xe236,
    fontFamily: fillFamily,
  );
  static const IconData notesRounded = IconData(0xe484, fontFamily: fillFamily);
  static const IconData notificationsActiveOutlined = IconData(
    0xe5e8,
    fontFamily: fillFamily,
  );
  static const IconData notificationsNoneRounded = IconData(
    0xe0ce,
    fontFamily: boldFamily,
  );
  static const IconData notificationsOffOutlined = IconData(
    0xe0d4,
    fontFamily: fillFamily,
  );
  static const IconData notificationsRounded = IconData(
    0xe0ce,
    fontFamily: fillFamily,
  );
  static const IconData openInNewRounded = IconData(
    0xe5de,
    fontFamily: boldFamily,
  );
  static const IconData pauseCircleOutlineRounded = IconData(
    0xe3a0,
    fontFamily: fillFamily,
  );
  static const IconData pauseRounded = IconData(0xe39e, fontFamily: fillFamily);
  static const IconData paymentsOutlined = IconData(
    0xe588,
    fontFamily: fillFamily,
  );
  static const IconData peopleOutlineRounded = IconData(
    0xe4d6,
    fontFamily: fillFamily,
  );
  static const IconData person = IconData(0xe4c2, fontFamily: boldFamily);
  static const IconData personAddAlt1Rounded = IconData(
    0xe4d0,
    fontFamily: fillFamily,
  );
  static const IconData personOffOutlined = IconData(
    0xe4ce,
    fontFamily: fillFamily,
  );
  static const IconData personOutline = IconData(
    0xe4c2,
    fontFamily: boldFamily,
  );
  static const IconData personOutlineRounded = IconData(
    0xe4c2,
    fontFamily: boldFamily,
  );
  static const IconData personRounded = IconData(
    0xe4c2,
    fontFamily: fillFamily,
  );
  static const IconData personalInjuryRounded = IconData(
    0xe0b2,
    fontFamily: fillFamily,
  );
  static const IconData petsRounded = IconData(0xe648, fontFamily: fillFamily);
  static const IconData phoneAndroid = IconData(0xe1e0, fontFamily: fillFamily);
  static const IconData phoneDisabledOutlined = IconData(
    0xe3c2,
    fontFamily: fillFamily,
  );
  static const IconData phoneIphone = IconData(0xe1e0, fontFamily: fillFamily);
  static const IconData phoneIphoneRounded = IconData(
    0xe1e0,
    fontFamily: fillFamily,
  );
  static const IconData phoneMissedRounded = IconData(
    0xe3c4,
    fontFamily: fillFamily,
  );
  static const IconData phoneOutlined = IconData(
    0xe3b8,
    fontFamily: fillFamily,
  );
  static const IconData phonelinkLockRounded = IconData(
    0xe1e2,
    fontFamily: fillFamily,
  );
  static const IconData photoCameraFrontOutlined = IconData(
    0xe6fc,
    fontFamily: fillFamily,
  );
  static const IconData photoCameraOutlined = IconData(
    0xe10e,
    fontFamily: fillFamily,
  );
  static const IconData photoLibraryOutlined = IconData(
    0xe836,
    fontFamily: fillFamily,
  );
  static const IconData pictureAsPdfOutlined = IconData(
    0xe702,
    fontFamily: fillFamily,
  );
  static const IconData pictureAsPdfRounded = IconData(
    0xe702,
    fontFamily: fillFamily,
  );
  static const IconData placeOutlined = IconData(
    0xe316,
    fontFamily: fillFamily,
  );
  static const IconData plagiarismOutlined = IconData(
    0xe238,
    fontFamily: fillFamily,
  );
  static const IconData playArrowRounded = IconData(
    0xe3d0,
    fontFamily: fillFamily,
  );
  static const IconData policyOutlined = IconData(
    0xe40c,
    fontFamily: fillFamily,
  );
  static const IconData policyRounded = IconData(
    0xe40c,
    fontFamily: fillFamily,
  );
  static const IconData printOutlined = IconData(
    0xe3dc,
    fontFamily: fillFamily,
  );
  static const IconData privacyTipOutlined = IconData(
    0xe412,
    fontFamily: fillFamily,
  );
  static const IconData publicRounded = IconData(
    0xe28c,
    fontFamily: fillFamily,
  );
  static const IconData pushPin = IconData(0xe3e2, fontFamily: fillFamily);
  static const IconData pushPinOutlined = IconData(
    0xe3e2,
    fontFamily: boldFamily,
  );
  static const IconData radioButtonCheckedRounded = IconData(
    0xeb08,
    fontFamily: fillFamily,
  );
  static const IconData radioButtonUncheckedRounded = IconData(
    0xe18a,
    fontFamily: fillFamily,
  );
  static const IconData rateReviewOutlined = IconData(
    0xe166,
    fontFamily: fillFamily,
  );
  static const IconData receiptLongOutlined = IconData(
    0xe3ec,
    fontFamily: fillFamily,
  );
  static const IconData receiptLongRounded = IconData(
    0xe3ec,
    fontFamily: fillFamily,
  );
  static const IconData recordVoiceOverOutlined = IconData(
    0xeca8,
    fontFamily: fillFamily,
  );
  static const IconData refreshRounded = IconData(
    0xe036,
    fontFamily: boldFamily,
  );
  static const IconData removeCircleOutlineRounded = IconData(
    0xe32c,
    fontFamily: boldFamily,
  );
  static const IconData removeRounded = IconData(
    0xe32a,
    fontFamily: boldFamily,
  );
  static const IconData replayRounded = IconData(
    0xe038,
    fontFamily: fillFamily,
  );
  static const IconData replyRounded = IconData(0xe024, fontFamily: fillFamily);
  static const IconData restartAltRounded = IconData(
    0xe038,
    fontFamily: fillFamily,
  );
  static const IconData sailingRounded = IconData(
    0xe786,
    fontFamily: fillFamily,
  );
  static const IconData saveOutlined = IconData(0xe248, fontFamily: fillFamily);
  static const IconData scheduleRounded = IconData(
    0xe19a,
    fontFamily: fillFamily,
  );
  static const IconData scheduleSendOutlined = IconData(
    0xed2c,
    fontFamily: fillFamily,
  );
  static const IconData schoolRounded = IconData(
    0xe62c,
    fontFamily: fillFamily,
  );
  static const IconData search = IconData(0xe30c, fontFamily: boldFamily);
  static const IconData searchOffRounded = IconData(
    0xe30e,
    fontFamily: boldFamily,
  );
  static const IconData searchOutlined = IconData(
    0xe30c,
    fontFamily: boldFamily,
  );
  static const IconData searchRounded = IconData(
    0xe30c,
    fontFamily: boldFamily,
  );
  static const IconData securityRounded = IconData(
    0xe40c,
    fontFamily: fillFamily,
  );
  static const IconData sendOutlined = IconData(0xe398, fontFamily: boldFamily);
  static const IconData sendRounded = IconData(0xe398, fontFamily: fillFamily);
  static const IconData settingsOutlined = IconData(
    0xe272,
    fontFamily: fillFamily,
  );
  static const IconData shieldOutlined = IconData(
    0xe40a,
    fontFamily: boldFamily,
  );
  static const IconData shieldRounded = IconData(
    0xe40a,
    fontFamily: fillFamily,
  );
  static const IconData shortTextRounded = IconData(
    0xe484,
    fontFamily: boldFamily,
  );
  static const IconData slideshowRounded = IconData(
    0xe654,
    fontFamily: fillFamily,
  );
  static const IconData smartphoneRounded = IconData(
    0xe1e0,
    fontFamily: fillFamily,
  );
  static const IconData smsOutlined = IconData(0xe170, fontFamily: fillFamily);
  static const IconData starBorderRounded = IconData(
    0xe46a,
    fontFamily: boldFamily,
  );
  static const IconData starHalfRounded = IconData(
    0xe70a,
    fontFamily: fillFamily,
  );
  static const IconData starOutlineRounded = IconData(
    0xe46a,
    fontFamily: boldFamily,
  );
  static const IconData starRounded = IconData(0xe46a, fontFamily: fillFamily);
  static const IconData stickyNote2Outlined = IconData(
    0xe348,
    fontFamily: fillFamily,
  );
  static const IconData supportAgentOutlined = IconData(
    0xe584,
    fontFamily: fillFamily,
  );
  static const IconData supportAgentRounded = IconData(
    0xe584,
    fontFamily: fillFamily,
  );
  static const IconData tableChartRounded = IconData(
    0xe476,
    fontFamily: fillFamily,
  );
  static const IconData tagRounded = IconData(0xe2a2, fontFamily: boldFamily);
  static const IconData taskAltRounded = IconData(
    0xe184,
    fontFamily: boldFamily,
  );
  static const IconData thumbUpAltOutlined = IconData(
    0xe48e,
    fontFamily: boldFamily,
  );
  static const IconData thumbUpAltRounded = IconData(
    0xe48e,
    fontFamily: fillFamily,
  );
  static const IconData timerOutlined = IconData(
    0xe492,
    fontFamily: fillFamily,
  );
  static const IconData titleRounded = IconData(0xe48a, fontFamily: boldFamily);
  static const IconData translateRounded = IconData(
    0xe4a2,
    fontFamily: boldFamily,
  );
  static const IconData travelExploreOutlined = IconData(
    0xe28c,
    fontFamily: fillFamily,
  );
  static const IconData travelExploreRounded = IconData(
    0xe28c,
    fontFamily: fillFamily,
  );
  static const IconData tuneRounded = IconData(0xe434, fontFamily: boldFamily);
  static const IconData unarchiveOutlined = IconData(
    0xe00c,
    fontFamily: fillFamily,
  );
  static const IconData undoRounded = IconData(0xe08a, fontFamily: boldFamily);
  static const IconData uploadFileOutlined = IconData(
    0xe61e,
    fontFamily: boldFamily,
  );
  static const IconData uploadFileRounded = IconData(
    0xe61e,
    fontFamily: boldFamily,
  );
  static const IconData verifiedRounded = IconData(
    0xe606,
    fontFamily: fillFamily,
  );
  static const IconData verifiedUserOutlined = IconData(
    0xe40c,
    fontFamily: fillFamily,
  );
  static const IconData videocamOffOutlined = IconData(
    0xe4dc,
    fontFamily: fillFamily,
  );
  static const IconData visibilityOffOutlined = IconData(
    0xe224,
    fontFamily: fillFamily,
  );
  static const IconData visibilityOutlined = IconData(
    0xe220,
    fontFamily: fillFamily,
  );
  static const IconData volumeUpRounded = IconData(
    0xe44a,
    fontFamily: boldFamily,
  );
  static const IconData warningAmberRounded = IconData(
    0xe4e0,
    fontFamily: fillFamily,
  );
  static const IconData wbSunnyOutlined = IconData(
    0xe472,
    fontFamily: fillFamily,
  );
  static const IconData wifiOffRounded = IconData(
    0xe4f2,
    fontFamily: fillFamily,
  );
  static const IconData workOutlineRounded = IconData(
    0xe0ee,
    fontFamily: boldFamily,
  );
  static const IconData workRounded = IconData(0xe0ee, fontFamily: fillFamily);
  static const IconData workspacePremiumOutlined = IconData(
    0xe616,
    fontFamily: fillFamily,
  );

  // Owner 2026-10-01: reels and stickers.
  static const IconData videoCameraOutlined = IconData(
    0xe4da,
    fontFamily: fillFamily,
  );
  static const IconData filmReelOutlined = IconData(
    0xe8c0,
    fontFamily: boldFamily,
  );
  static const IconData filmReelRounded = IconData(
    0xe8c0,
    fontFamily: fillFamily,
  );
  static const IconData speakerHigh = IconData(0xe44a, fontFamily: fillFamily);
  static const IconData speakerSlash = IconData(0xe45a, fontFamily: fillFamily);

  /// Owner 2026-10-18: the profile «Рилсы» tab — a play button in a circle
  /// reads as "video" everywhere (outline, like the other tab icons).
  static const IconData playCircleOutlined = IconData(
    0xe3d2,
    fontFamily: boldFamily,
  );
  static const IconData playCircleRounded = IconData(
    0xe3d2,
    fontFamily: fillFamily,
  );
  static const IconData stickerOutlined = IconData(
    0xe5ac,
    fontFamily: fillFamily,
  );
  static const IconData keyboardRounded = IconData(
    0xe2d8,
    fontFamily: boldFamily,
  );
  static const IconData smileyStickerOutlined = IconData(
    0xe440,
    fontFamily: fillFamily,
  );
  static const IconData sellOutlined = IconData(0xe478, fontFamily: fillFamily);
  static const IconData giftOutlined = IconData(0xe276, fontFamily: fillFamily);
  static const IconData groupAddOutlined = IconData(
    0xe68e,
    fontFamily: fillFamily,
  );
  static const IconData shareNetworkOutlined = IconData(
    0xe408,
    fontFamily: boldFamily,
  );

  // Owner 2026-10-05: reels (back, trim, inner page) and video calls.
  static const IconData arrowBackRounded = IconData(
    0xe058,
    fontFamily: boldFamily,
  );
  static const IconData cameraRotateOutlined = IconData(
    0xe7a4,
    fontFamily: fillFamily,
  );
  // Owner 2026-10-22: the media preview before sending (rotate, crop).
  static const IconData rotateRightRounded = IconData(
    0xe036,
    fontFamily: boldFamily,
  );
  static const IconData rotateLeftRounded = IconData(
    0xe038,
    fontFamily: boldFamily,
  );
  static const IconData cropRounded = IconData(0xe1d4, fontFamily: boldFamily);
  static const IconData contentCutRounded = IconData(
    0xeae0,
    fontFamily: boldFamily,
  );
  static const IconData bookOpenTextOutlined = IconData(
    0xe8f2,
    fontFamily: fillFamily,
  );

  // Owner 2026-10-20: QR codes (My QR code, scanner, flashlight).
  static const IconData qrCode = IconData(0xe3e6, fontFamily: boldFamily);
  static const IconData scan = IconData(0xebb6, fontFamily: boldFamily);
  static const IconData flashlight = IconData(0xe246, fontFamily: boldFamily);
}
