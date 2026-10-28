import AVFoundation
import CallKit
import CoreSpotlight
import Flutter
import PushKit
import UIKit
import UniformTypeIdentifiers
import UserNotifications
import flutter_callkit_incoming

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate,
  PKPushRegistryDelegate, CallkitIncomingAppDelegate
{
  /// Owner 2026-10-17: incoming calls arrive as VoIP (PushKit) pushes so
  /// iOS shows the call screen and rings even when the app is closed.
  private var voipRegistry: PKPushRegistry?
  /// LC-1: reads which CallKit calls exist (ringing / answered). Only
  /// observes — the ONE CallKit provider stays the plugin's.
  private let callObserver = CXCallObserver()
  /// LC-1: asks iOS to end a CallKit call; the plugin's provider performs
  /// it exactly like an end from the Dart side (one handler).
  private let callController = CXCallController()

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    voipRegistry = registry
    configureAudioSessionOnce()
    // Planner reminders armed by flutter_local_notifications show while the
    // app is open too.
    UNUserNotificationCenter.current().delegate = self
    registerChatCategory()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // MARK: - Chat notification buttons

  /// Owner 2026-10-26 (WhatsApp): «Ответить» (type a reply on the banner /
  /// lock screen) and «Прочитано» under a chat push (`aps.category =
  /// chat_message`, api notifications/push/actor-push.ts). They work with
  /// the app closed: iOS wakes the app in the background for the button,
  /// which posts the push's signed ticket + this device's push token to
  /// `POST /push-actions` (the server accepts it only while this device is
  /// signed in to that account).
  static let chatCategory = "chat_message"
  static let replyAction = "chat_reply"
  static let readAction = "chat_read"
  private static let apiKey = "lawbid.pushActions.api"
  private static let deviceKey = "lawbid.pushActions.device"

  private func registerChatCategory() {
    let ru = (Locale.preferredLanguages.first ?? "").hasPrefix("ru")
    let reply = UNTextInputNotificationAction(
      identifier: AppDelegate.replyAction,
      title: ru ? "Ответить" : "Reply",
      options: [],
      textInputButtonTitle: ru ? "Отправить" : "Send",
      textInputPlaceholder: ru ? "Сообщение" : "Message")
    let read = UNNotificationAction(
      identifier: AppDelegate.readAction,
      title: ru ? "Прочитано" : "Mark as read",
      options: [])
    let chat = UNNotificationCategory(
      identifier: AppDelegate.chatCategory,
      actions: [reply, read],
      intentIdentifiers: [],
      options: [])
    let center = UNUserNotificationCenter.current()
    center.getNotificationCategories { existing in
      // Keep categories registered by plugins (flutter_local_notifications).
      var all = existing.filter { $0.identifier != AppDelegate.chatCategory }
      all.insert(chat)
      center.setNotificationCategories(all)
    }
  }

  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let action = response.actionIdentifier
    guard action == AppDelegate.replyAction || action == AppDelegate.readAction else {
      super.userNotificationCenter(
        center, didReceive: response, withCompletionHandler: completionHandler)
      return
    }
    let info = response.notification.request.content.userInfo
    let defaults = UserDefaults.standard
    guard let token = info["actionToken"] as? String,
      let api = defaults.string(forKey: AppDelegate.apiKey),
      let device = defaults.string(forKey: AppDelegate.deviceKey),
      let url = URL(string: api + "/push-actions")
    else {
      completionHandler()
      return
    }
    var body: [String: Any] = ["token": token, "fcmToken": device]
    if let messageId = info["messageId"] as? String, !messageId.isEmpty {
      body["messageId"] = messageId
    }
    let thread = response.notification.request.content.threadIdentifier
    if action == AppDelegate.readAction {
      body["action"] = "read"
      // WhatsApp: the chat's notifications go at once.
      center.getDeliveredNotifications { delivered in
        let ids = delivered
          .filter { $0.request.content.threadIdentifier == thread }
          .map { $0.request.identifier }
        if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
      }
    } else {
      let text = (response as? UNTextInputNotificationResponse)?.userText
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if text.isEmpty {
        completionHandler()
        return
      }
      body["action"] = "reply"
      body["text"] = text
      body["clientMessageId"] = UUID().uuidString
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    // iOS gives a background button a few seconds; keep the app alive
    // until the request is done.
    var task: UIBackgroundTaskIdentifier = .invalid
    task = UIApplication.shared.beginBackgroundTask {
      UIApplication.shared.endBackgroundTask(task)
    }
    URLSession.shared.dataTask(with: request) { _, _, _ in
      DispatchQueue.main.async {
        completionHandler()
        UIApplication.shared.endBackgroundTask(task)
      }
    }.resume()
  }

  private static func setPushActions(url: String?, token: String?) {
    let d = UserDefaults.standard
    if let url = url, !url.isEmpty, let token = token, !token.isEmpty {
      d.set(url.hasSuffix("/") ? String(url.dropLast()) : url, forKey: apiKey)
      d.set(token, forKey: deviceKey)
    } else {
      d.removeObject(forKey: apiKey)
      d.removeObject(forKey: deviceKey)
    }
  }

  /// Owner 2026-10-19 (the click when a video starts / stops): the audio
  /// session's category is set ONCE, at launch — playback (sound with the
  /// silent switch on, like Instagram), movie playback mode. video_player
  /// only changes the category when it differs ("upgrade"), so with this in
  /// place no player switches the session when a reel starts, loops or is
  /// swiped away. It is not activated here (that would stop the person's
  /// music the moment the app opens); the first video with sound activates
  /// it and it stays active. Calls (CallKit / WebRTC) still set their own
  /// mode while a call is on.
  private func configureAudioSessionOnce() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .moviePlayback, options: [])
    } catch {
      NSLog("audio session: \(error)")
    }
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // The app's own engine now has the CallKit plugin (the same shared
    // instance, with the call a VoIP push reported before): the stand-in
    // engine of a background launch is no longer needed.
    if let standIn = callkitEngine {
      callkitEngine = nil
      standIn.destroyContext()
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "LawbidChatNotifications") {
      registerChatNotifications(registrar.messenger())
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "LawbidSecureScreen") {
      registerSecureScreen(registrar.messenger())
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "LawbidSpotlight") {
      SpotlightBridge.shared.register(registrar)
    }
  }

  // MARK: - Secure screen

  /// Security research #5 (2026-10-22), B5: while a screen with an ID
  /// document / licence is open (lib/core/platform/secure_screen.dart) a
  /// screen recording or mirroring shows a blank window instead of the
  /// document. iOS cannot stop a screenshot; a recording it can hide.
  private var secureScreen = false
  private var captureCover: UIView?
  private var captureObserver: NSObjectProtocol?

  private func registerSecureScreen(_ messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(name: "lawbid/secure_screen", binaryMessenger: messenger)
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(nil)
        return
      }
      switch call.method {
      case "setSecure":
        let args = call.arguments as? [String: Any]
        self.setSecureScreen(args?["secure"] as? Bool ?? false)
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  private func setSecureScreen(_ on: Bool) {
    secureScreen = on
    if on, captureObserver == nil {
      captureObserver = NotificationCenter.default.addObserver(
        forName: UIScreen.capturedDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.updateCaptureCover()
      }
    }
    updateCaptureCover()
  }

  /// The key window — of the scene (SceneDelegate) or, failing that, the
  /// app delegate's own.
  private func activeWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    for scene in scenes {
      if let key = scene.windows.first(where: { $0.isKeyWindow }) { return key }
    }
    return scenes.first?.windows.first ?? window
  }

  private func updateCaptureCover() {
    let shouldCover = secureScreen && UIScreen.main.isCaptured
    if shouldCover {
      guard captureCover == nil, let w = activeWindow() else { return }
      let cover = UIView(frame: w.bounds)
      cover.backgroundColor = UIColor.systemBackground
      cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      cover.isUserInteractionEnabled = false
      w.addSubview(cover)
      captureCover = cover
    } else {
      captureCover?.removeFromSuperview()
      captureCover = nil
    }
  }

  // MARK: - Chat notifications

  /// Owner 2026-10-22 (message pushes like WhatsApp): the names saved in the
  /// phone book for LawBid contacts go to the App Group the chat push
  /// extension reads (NotificationService/NotificationService.swift); an
  /// opened chat takes its notifications (one thread per chat) off the
  /// lock screen; a sign-out clears them all. Taps are FCM's own
  /// (onMessageOpenedApp), so `pendingOpen` has nothing to say here.
  private func registerChatNotifications(_ messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: "lawbid/chat_notifications", binaryMessenger: messenger)
    channel.setMethodCallHandler { call, result in
      let args = call.arguments as? [String: Any]
      let center = UNUserNotificationCenter.current()
      switch call.method {
      case "setContactNames":
        let names = args?["names"] as? [String: String] ?? [:]
        let app = Bundle.main.bundleIdentifier ?? "com.lawbid.lawbid"
        UserDefaults(suiteName: "group.\(app)")?.set(names, forKey: "chatContactNames")
        result(nil)
      case "clear":
        guard let id = args?["conversationId"] as? String, !id.isEmpty else {
          result(nil)
          return
        }
        center.getDeliveredNotifications { delivered in
          let ids = delivered
            .filter { $0.request.content.threadIdentifier == id }
            .map { $0.request.identifier }
          if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
        result(nil)
      case "clearAll":
        center.getDeliveredNotifications { delivered in
          let ids = delivered
            .filter { $0.request.content.userInfo["type"] as? String == "new_message" }
            .map { $0.request.identifier }
          if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
        let app = Bundle.main.bundleIdentifier ?? "com.lawbid.lawbid"
        UserDefaults(suiteName: "group.\(app)")?.removeObject(forKey: "chatContactNames")
        // Signed out: the notification buttons stop working on this phone.
        AppDelegate.setPushActions(url: nil, token: nil)
        result(nil)
      case "setPushActions":
        AppDelegate.setPushActions(
          url: args?["url"] as? String, token: args?["token"] as? String)
        result(nil)
      case "pendingOpen":
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  // MARK: - PushKit

  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate credentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else { return }
    let token = credentials.token.map { String(format: "%02x", $0) }.joined()
    // Dart reads it (getDevicePushTokenVoIP) and sends it to the server.
    // Owner 2026-10-26: with UIScene the plugins are registered only when
    // the window appears — iOS hands the token over before that, and
    // `sharedInstance?.` dropped it, so the server never learnt this
    // iPhone's VoIP token and calls could not ring a closed app. The token
    // is stored where the plugin keeps it (its "DevicePushTokenVoIP"
    // default) whether or not the plugin is up yet.
    UserDefaults.standard.set(token, forKey: Self.voipTokenKey)
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    UserDefaults.standard.set("", forKey: Self.voipTokenKey)
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP("")
  }

  /// flutter_callkit_incoming's own key for the VoIP token (3.1.6,
  /// SwiftFlutterCallkitIncomingPlugin.devicePushTokenVoIP).
  private static let voipTokenKey = "DevicePushTokenVoIP"

  /// Owner 2026-10-26 (calls did not ring a closed / locked iPhone): a VoIP
  /// push that launches the app in the background connects no window, so
  /// the UIScene app never registers its plugins and the CallKit plugin is
  /// missing. iOS then kills an app that does not report the call — and,
  /// after a few times, stops sending it VoIP pushes at all. A small
  /// stand-in engine (an empty Dart entry, only this plugin) brings the
  /// plugin up so the call is always reported; the app's own engine takes
  /// the same plugin instance over when the window appears.
  private var callkitEngine: FlutterEngine?

  private func callkitPlugin() -> SwiftFlutterCallkitIncomingPlugin? {
    if let plugin = SwiftFlutterCallkitIncomingPlugin.sharedInstance { return plugin }
    let engine = FlutterEngine(name: "lawbid.callkit", project: nil, allowHeadlessExecution: true)
    guard
      engine.run(
        withEntrypoint: "callkitPushEntry",
        libraryURI: "package:lawbid/features/calls/application/callkit_bridge.dart"),
      let registrar = engine.registrar(forPlugin: "FlutterCallkitIncomingPlugin")
    else {
      NSLog("callkit: stand-in engine did not start")
      return nil
    }
    SwiftFlutterCallkitIncomingPlugin.register(with: registrar)
    callkitEngine = engine
    return SwiftFlutterCallkitIncomingPlugin.sharedInstance
  }

  /// iOS requires every VoIP push to report a call to CallKit at once —
  /// the same fields as the Dart side (callkit_bridge.dart), so a call the
  /// open app also shows is one call (same id).
  // Push → CallKit pattern from flutter_callkit_incoming's example
  // AppDelegate (every VoIP push → showCallkitIncoming(data, fromPushKit:
  // true) { completion() }), tag v3.1.6, commit
  // 27cd33c1665b7fbc4c8032a7866c929103029592,
  // https://github.com/hiennguyen92/flutter_callkit_incoming
  // MIT License, Copyright (c) 2021 Hien Nguyen — see THIRD_PARTY_NOTICES.md.
  // Mapped to our payload keys; the example's event logging to its author's
  // server is NOT used.
  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    // Without the plugin there is no CallKit provider to report to; finish
    // the push instead of leaving iOS waiting (only if even the stand-in
    // engine could not start).
    guard let callkit = callkitPlugin() else {
      completion()
      return
    }
    let p = payload.dictionaryPayload
    // LC-1 (audit 2026-10-26): «stop ringing» comes as a VoIP push too —
    // the silent push did not reach a locked / closed iPhone in time and
    // CallKit rang on for 45 s.
    if (p["type"] as? String) == "call_ended" {
      handleCallEndedPush(callkit, p, completion: completion)
      return
    }
    let callId = (p["callId"] as? String) ?? UUID().uuidString
    // M1 (2026-10-28): as in the reference, every VoIP push reports its
    // call — also one the open app's socket showed a moment ago (same id:
    // CallKit answers «already exists», nothing changes on screen). The old
    // early return finished the push WITHOUT a report, which makes iOS
    // stop delivering VoIP pushes («only a missed call»).
    let name = (p["callerName"] as? String) ?? "LawBid"
    // LC-1: the stop came before the ring (Apple may reorder): iOS still
    // wants a reported call for this push — report it and end it at once.
    if wasEndedByPush(callId) {
      reportThenEnd(callkit, callId: callId, name: name, completion: completion)
      return
    }
    let video = (p["video"] as? String) == "1"
    let data = flutter_callkit_incoming.Data(
      id: callId,
      nameCaller: name,
      handle: "LawBid",
      type: video ? 1 : 0
    )
    data.appName = "LawBid"
    // M2 (2026-10-28): one ring length everywhere — 60 s (the server's
    // CALL_RING_SECONDS, common/calls/ring.ts; it was 45 s here).
    data.duration = 60000
    // Owner 2026-10-26: the caller's photo (CallKit itself shows only the
    // name; the app's call screen takes the photo from here).
    let avatar = (p["avatarUrl"] as? String) ?? ""
    data.avatar = avatar
    data.extra = [
      "callId": callId,
      "conversationId": (p["conversationId"] as? String) ?? "",
      "avatarUrl": avatar,
    ]
    data.handleType = "generic"
    data.supportsVideo = video
    data.maximumCallGroups = 1
    data.maximumCallsPerCallGroup = 1
    data.supportsDTMF = false
    data.supportsHolding = false
    data.isShowMissedCallNotification = false
    // "Calls" switched off in Settings: the call shows without a ringtone.
    if (p["silent"] as? String) == "1" {
      data.ringtonePath = "silence"
    }
    callkit.showCallkitIncoming(
      data,
      fromPushKit: true
    ) {
      completion()
    }
  }

  // MARK: - Stop ringing (LC-1)

  /// The VoIP «call_ended» push (server: ApnsVoipSender.endCall; only to
  /// iPhones the call rang, never to the one that answered). Ends the
  /// ringing CallKit call through iOS (CXEndCallAction — the plugin's one
  /// provider handles it as it does an end from Dart). A call answered on
  /// THIS phone is never touched. Nothing on screen: iOS requires every
  /// VoIP push to report a call, so one is reported and ended at once.
  private func handleCallEndedPush(
    _ callkit: SwiftFlutterCallkitIncomingPlugin,
    _ p: [AnyHashable: Any],
    completion: @escaping () -> Void
  ) {
    let callId = (p["callId"] as? String) ?? ""
    rememberEndedByPush(callId)
    let uuid = UUID(uuidString: callId)
    let live = callObserver.calls.filter { !$0.hasEnded }
    if let uuid = uuid, let ringing = live.first(where: { $0.uuid == uuid }) {
      if !ringing.hasConnected && !ringing.isOutgoing {
        callController.request(CXTransaction(action: CXEndCallAction(call: uuid))) { _ in }
      }
      completion()
      return
    }
    // Another call is on (answered here): leave it alone — the app holds a
    // call, nothing new is shown over it.
    if !live.isEmpty || uuid == nil {
      completion()
      return
    }
    reportThenEnd(callkit, callId: callId, name: "LawBid", completion: completion)
  }

  /// Report a call (silent) and end it straight away — what iOS accepts
  /// for a VoIP push that has nothing left to ring.
  private func reportThenEnd(
    _ callkit: SwiftFlutterCallkitIncomingPlugin,
    callId: String,
    name: String,
    completion: @escaping () -> Void
  ) {
    let data = flutter_callkit_incoming.Data(
      id: callId,
      nameCaller: name,
      handle: "LawBid",
      type: 0
    )
    data.appName = "LawBid"
    data.duration = 1000
    data.handleType = "generic"
    data.maximumCallGroups = 1
    data.maximumCallsPerCallGroup = 1
    data.isShowMissedCallNotification = false
    data.ringtonePath = "silence"
    callkit.showCallkitIncoming(data, fromPushKit: true) { [weak self] in
      if let uuid = UUID(uuidString: callId) {
        self?.callController.request(
          CXTransaction(action: CXEndCallAction(call: uuid))
        ) { _ in }
      }
      completion()
    }
  }

  private static let endedKey = "lawbid.voip.endedCalls"

  /// Call ids stopped by a VoIP push in the last 10 minutes (survives the
  /// app being relaunched by the next push).
  private func rememberEndedByPush(_ callId: String) {
    guard !callId.isEmpty else { return }
    let now = Date().timeIntervalSince1970
    var all = (UserDefaults.standard.dictionary(forKey: Self.endedKey)
      as? [String: Double]) ?? [:]
    all = all.filter { now - $0.value < 600 }
    all[callId.lowercased()] = now
    UserDefaults.standard.set(all, forKey: Self.endedKey)
  }

  private func wasEndedByPush(_ callId: String) -> Bool {
    let all = (UserDefaults.standard.dictionary(forKey: Self.endedKey)
      as? [String: Double]) ?? [:]
    guard let at = all[callId.lowercased()] else { return false }
    return Date().timeIntervalSince1970 - at < 600
  }

  // MARK: - CallKit (CallkitIncomingAppDelegate)

  /// Owner 2026-10-21 (Apple / LiveKit's CallKit design): the call answered
  /// on the system sheet is THE call for its whole life — the answer is
  /// confirmed to iOS at once (a late or missing confirmation ends the
  /// call), it is never ended and re-created, and WebRTC starts its audio
  /// only when iOS hands the audio session over (didActivate).
  func onAccept(_ call: Call, _ action: CXAnswerCallAction) {
    action.fulfill()
  }

  func onDecline(_ call: Call, _ action: CXEndCallAction) {
    action.fulfill()
  }

  func onEnd(_ call: Call, _ action: CXEndCallAction) {
    action.fulfill()
  }

  func onTimeOut(_ call: Call) {}

  func didActivateAudioSession(_ audioSession: AVAudioSession) {
    webrtcAudioSession(activated: true, audioSession)
  }

  func didDeactivateAudioSession(_ audioSession: AVAudioSession) {
    webrtcAudioSession(activated: false, audioSession)
  }

  func providerDidReset() {}

  /// Tells WebRTC's RTCAudioSession that CallKit activated / deactivated
  /// the audio session (looked up by name: the framework ships with
  /// flutter_webrtc, there is no module to import here). Without this
  /// WebRTC never learns the session is live — a call answered from the
  /// sheet has no sound, or its audio unit fails and the call ends.
  private func webrtcAudioSession(activated: Bool, _ session: AVAudioSession) {
    guard let cls = NSClassFromString("RTCAudioSession") else { return }
    guard
      let shared = (cls as AnyObject).perform(NSSelectorFromString("sharedInstance"))?
        .takeUnretainedValue() as? NSObject
    else { return }
    let selector = NSSelectorFromString(
      activated ? "audioSessionDidActivate:" : "audioSessionDidDeactivate:"
    )
    if shared.responds(to: selector) {
      _ = shared.perform(selector, with: session)
    }
  }
}

// MARK: - Spotlight

/// Owner 2026-10-27 (app indexing, docs/architecture/PSEO_ASO_PACKAGE_PLAN
/// §3): iPhone Spotlight finds the attorney profiles and saved posts the
/// user opened or saved. Invisible plumbing, no screen.
///
/// - CoreSpotlight, on-device index only (`CSSearchableIndex.default()`):
///   nothing is sent to Apple's public index.
/// - Title and subtitle only (what the public page shows), expiry 60 days.
/// - The item's identifier is its https link. A tap on a result reaches the
///   scene as `CSSearchableItemActionType`; the link goes to Dart over
///   `lawbid/spotlight`, where it is handled like a Universal Link.
final class SpotlightBridge: NSObject, FlutterSceneLifeCycleDelegate {
  static let shared = SpotlightBridge()

  private static let ttl: TimeInterval = 60 * 24 * 60 * 60

  private var channel: FlutterMethodChannel?
  /// Dart asked for the launch link, so it is listening for `open`.
  private var dartReady = false
  /// A result tapped before Dart listened (a cold start).
  private var pending: String?

  func register(_ registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "lawbid/spotlight", binaryMessenger: registrar.messenger())
    self.channel = channel
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else {
        result(nil)
        return
      }
      self.handle(call, result: result)
    }
    registrar.addSceneDelegate(self)
  }

  private func handle(_ call: FlutterMethodCall, result: FlutterResult) {
    let args = call.arguments as? [String: Any]
    switch call.method {
    case "index":
      guard let id = args?["id"] as? String, let title = args?["title"] as? String else {
        result(nil)
        return
      }
      let attributes = CSSearchableItemAttributeSet(contentType: UTType.content)
      attributes.title = title
      attributes.contentDescription = args?["subtitle"] as? String
      let item = CSSearchableItem(
        uniqueIdentifier: id,
        domainIdentifier: args?["domain"] as? String,
        attributeSet: attributes)
      item.expirationDate = Date(timeIntervalSinceNow: SpotlightBridge.ttl)
      CSSearchableIndex.default().indexSearchableItems([item]) { error in
        if let error = error { NSLog("spotlight index: \(error)") }
      }
      result(nil)
    case "remove":
      if let id = args?["id"] as? String {
        CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: [id]) { _ in }
      }
      result(nil)
    case "clear":
      CSSearchableIndex.default().deleteAllSearchableItems { _ in }
      result(nil)
    case "initialLink":
      dartReady = true
      let link = pending
      pending = nil
      result(link)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  /// A tapped Spotlight result: only our own https links are passed on.
  private func open(_ activity: NSUserActivity) -> Bool {
    guard activity.activityType == CSSearchableItemActionType,
      let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String,
      id.hasPrefix("https://")
    else { return false }
    if dartReady, let channel = channel {
      channel.invokeMethod("open", arguments: id)
    } else {
      pending = id
    }
    return true
  }

  // Cold start: the tapped result is in the connection options.
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions?
  ) -> Bool {
    var handled = false
    for activity in connectionOptions?.userActivities ?? [] {
      if open(activity) { handled = true }
    }
    return handled
  }

  // Warm start.
  func scene(
    _ scene: UIScene,
    continue userActivity: NSUserActivity
  ) -> Bool {
    return open(userActivity)
  }
}
