// Owner 2026-10-18 (OQ-055): the chat's attachment pieces, offered to other
// features (support tickets) through one seam instead of each feature
// importing the chat feature. They move into core when the chat refactor
// allows; callers only change this import.
export 'package:lawbid/features/chat/domain/chat_models.dart'
    show ChatAttachment;
export 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show fileSizeLabel, pickChatFiles;
export 'package:lawbid/features/chat/presentation/chat_album.dart'
    show
        ChatAlbumItem,
        ChatMediaAlbum,
        ChatPhoto,
        chatAspectOf,
        chatMediaBox,
        chatMediaLimits,
        chatPhotoBox;
export 'package:lawbid/features/chat/presentation/chat_video.dart'
    show ChatVideoTile;
