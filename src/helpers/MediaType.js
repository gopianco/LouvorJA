const VIDEO_EXTENSIONS = ["mp4", "mkv", "avi", "mov", "wmv", "webm"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "aac", "ogg", "wma", "m4a"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

function extensionOf(filePath) {
  if (!filePath) return "";
  return filePath.split(".").pop().toLowerCase();
}

export default {
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  extensionOf,
  isVideo(filePath) {
    return VIDEO_EXTENSIONS.includes(extensionOf(filePath));
  },
  isAudio(filePath) {
    return AUDIO_EXTENSIONS.includes(extensionOf(filePath));
  },
  isImage(filePath) {
    return IMAGE_EXTENSIONS.includes(extensionOf(filePath));
  },
};
