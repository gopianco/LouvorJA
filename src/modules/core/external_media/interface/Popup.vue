<template>
  <div class="w-100 h-100 bg-black d-flex align-center justify-center position-relative">
    <video
      v-if="isVideo && filePath"
      ref="popupVideo"
      class="w-100 h-100"
      style="object-fit: contain;"
      :src="filePath"
      muted
      @canplay="onCanPlay"
      @error="onError"
    />
    <img
      v-else-if="isImage && filePath"
      class="w-100 h-100"
      style="object-fit: contain;"
      :src="filePath"
    />
    <div v-else />
  </div>
</template>

<script>
import manifest from "../manifest.json";
import $mediaType from "@/helpers/MediaType";

export default {
  name: "PopupExternalMediaPage",
  computed: {
    module_id() {
      return manifest.id;
    },
    module() {
      return this.$modules.get(this.module_id);
    },
    rawFilePath() {
      return this.$appdata.get("modules.external_media.filePath") || "";
    },
    rawFilePaths() {
      const arr = this.$appdata.get("modules.external_media.filePaths");
      return Array.isArray(arr) && arr.length > 1 ? arr : (this.rawFilePath ? [this.rawFilePath] : []);
    },
    isGallery() {
      return this.rawFilePaths.length > 1;
    },
    slideIndex() {
      const idx = this.$appdata.get("modules.external_media.config.slide_index") || 0;
      return Math.min(Math.max(idx, 0), Math.max(this.rawFilePaths.length - 1, 0));
    },
    currentRawPath() {
      return this.isGallery ? (this.rawFilePaths[this.slideIndex] || this.rawFilePath) : this.rawFilePath;
    },
    filePath() {
      if (!this.currentRawPath) return "";
      if (window.electronAPI) {
        // Usa o dummy host 'app' para evitar que o Chromium altere o case do path no macOS/Linux
        const prefix = this.currentRawPath.startsWith("/") ? "local://app" : "local://app/";
        return `${prefix}${this.currentRawPath}`;
      }
      return this.currentRawPath;
    },
    mediaTitle() {
      return this.$appdata.get("modules.external_media.title") || "Mídia Externa";
    },
    isVideo() {
      return $mediaType.isVideo(this.rawFilePath);
    },
    isImage() {
      return $mediaType.isImage(this.rawFilePath);
    },
    isPaused() {
      return this.$appdata.get("modules.external_media.config.is_paused");
    },
    currentTime() {
      return this.$appdata.get("modules.external_media.config.current_time");
    },
  },
  watch: {
    currentTime(val) {
      const video = this.$refs.popupVideo;
      if (video && !video.seeking) {
        if (Math.abs(video.currentTime - val) > 0.5) {
          video.currentTime = val;
        }
      }
    },
    isPaused(val) {
      this.$nextTick(() => {
        const video = this.$refs.popupVideo;
        if (!video) return;
        if (val) {
          video.pause();
        } else {
          video.play().catch((err) => {
          });
        }
      });
    },
  },
  mounted() {
    this.$nextTick(() => {
      const video = this.$refs.popupVideo;
      if (video) {
        video.currentTime = this.currentTime || 0;
        if (!this.isPaused) {
          video.play().catch((err) => {
          });
        }
      }
    });
  },
  methods: {
    onCanPlay() {
      const video = this.$refs.popupVideo;
      if (video && !this.isPaused) {
        video.currentTime = this.currentTime || 0;
        video.play().catch((err) => {
        });
      }
    },
    onError(event) {
      const el = event.target;
      const error = el?.error;
      if (error) {
      }
    },
  },
};
</script>
