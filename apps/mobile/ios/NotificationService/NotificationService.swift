import Intents
import UserNotifications

/// Owner 2026-10-22 (message pushes like WhatsApp / Telegram): a chat push
/// (`data.style == "chat"`, sent with `mutable-content: 1`) becomes a
/// Communication Notification — the sender's round photo instead of the app
/// icon, the name the person saved in the phone book for this LawBid
/// contact, a group titled with the group. The app writes the saved names
/// into the shared App Group (AppDelegate.swift, `lawbid/chat_notifications`).
///
/// Not wired into Runner.xcodeproj yet: the target, its App ID, the App
/// Group and the Communication Notifications capability are set up in
/// Xcode / Apple Developer — docs/runbooks/IOS_CHAT_NOTIFICATIONS.md. Until
/// then the iPhone shows the server's alert as is (title = sender, body =
/// text, stacked per chat), just with the app icon.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent,
      content.userInfo["style"] as? String == "chat"
    else {
      contentHandler(request.content)
      return
    }
    bestAttempt = content
    let info = content.userInfo
    let senderId = info["senderId"] as? String ?? ""
    let group = info["isGroup"] as? String == "1"
    let serverName = info["senderName"] as? String ?? ""
    let saved = ChatContactNames.name(for: senderId)
    let name = saved ?? (serverName.isEmpty ? content.title : serverName)
    let text = info["text"] as? String ?? content.body
    if group {
      // The system shows the sender with the group; the bare text below.
      content.body = text
    } else if let saved = saved {
      content.title = saved
    }
    let conversation = info["conversationId"] as? String ?? ""
    let chatTitle = info["chatTitle"] as? String ?? ""

    let images = DispatchGroup()
    var senderImage: INImage?
    var groupImage: INImage?
    images.enter()
    AvatarCache.image(
      url: info["senderAvatar"] as? String,
      key: info["senderAvatarKey"] as? String
    ) {
      senderImage = $0
      images.leave()
    }
    if group {
      images.enter()
      AvatarCache.image(
        url: info["chatAvatar"] as? String,
        key: info["chatAvatarKey"] as? String
      ) {
        groupImage = $0
        images.leave()
      }
    }
    images.notify(queue: .global()) { [weak self] in
      guard let self = self else { return }
      let sender = INPerson(
        personHandle: INPersonHandle(value: senderId, type: .unknown),
        nameComponents: nil,
        displayName: name,
        image: senderImage,
        contactIdentifier: nil,
        customIdentifier: senderId
      )
      let me = INPerson(
        personHandle: INPersonHandle(value: "me", type: .unknown),
        nameComponents: nil,
        displayName: nil,
        image: nil,
        contactIdentifier: nil,
        customIdentifier: nil,
        isMe: true
      )
      let intent = INSendMessageIntent(
        recipients: group ? [me, sender] : [me],
        outgoingMessageType: .outgoingMessageText,
        content: text,
        speakableGroupName: group ? INSpeakableString(spokenPhrase: chatTitle) : nil,
        conversationIdentifier: conversation,
        serviceName: nil,
        sender: sender,
        attachments: nil
      )
      if group, let groupImage = groupImage {
        intent.setImage(groupImage, forParameterNamed: \.speakableGroupName)
      }
      let interaction = INInteraction(intent: intent, response: nil)
      interaction.direction = .incoming
      interaction.donate { _ in
        do {
          let updated = try content.updating(from: intent)
          self.finish(updated)
        } catch {
          // No Communication Notifications capability: the plain alert.
          self.finish(content)
        }
      }
    }
  }

  override func serviceExtensionTimeWillExpire() {
    if let content = bestAttempt { finish(content) }
  }

  private func finish(_ content: UNNotificationContent) {
    guard let handler = contentHandler else { return }
    contentHandler = nil
    handler(content)
  }
}

/// The names saved in the phone book for LawBid contacts (userId → name),
/// written by the app into the App Group shared with this extension.
enum ChatContactNames {
  static let key = "chatContactNames"

  static func name(for userId: String) -> String? {
    guard !userId.isEmpty,
      let names = AppGroup.defaults?.dictionary(forKey: key) as? [String: String],
      let name = names[userId], !name.isEmpty
    else { return nil }
    return name
  }
}

/// `group.<app bundle id>` — the same for the app and its extension
/// (`<app bundle id>.NotificationService`), in every flavor.
enum AppGroup {
  static var id: String {
    let bundle = Bundle.main.bundleIdentifier ?? "com.lawbid.lawbid"
    let app =
      bundle.hasSuffix(".NotificationService")
      ? String(bundle.dropLast(".NotificationService".count)) : bundle
    return "group.\(app)"
  }

  static var defaults: UserDefaults? { UserDefaults(suiteName: id) }
}

/// Photos by avatar file id (a signed link changes every push, the file
/// does not), kept in the extension's caches.
enum AvatarCache {
  static func image(url: String?, key: String?, done: @escaping (INImage?) -> Void) {
    guard let url = url, let link = URL(string: url),
      link.scheme == "https" || link.scheme == "http"
    else {
      done(nil)
      return
    }
    let name = (key?.isEmpty == false ? key! : String(url.hashValue))
      .replacingOccurrences(of: "/", with: "_")
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("chat_avatars", isDirectory: true)
    let file = dir.appendingPathComponent(name)
    if let data = try? Data(contentsOf: file) {
      done(INImage(imageData: data))
      return
    }
    var request = URLRequest(url: link)
    request.timeoutInterval = 8
    URLSession.shared.dataTask(with: request) { data, response, _ in
      guard let data = data, data.count < 2 * 1024 * 1024,
        (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? false
      else {
        done(nil)
        return
      }
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      try? data.write(to: file, options: .atomic)
      done(INImage(imageData: data))
    }.resume()
  }
}
