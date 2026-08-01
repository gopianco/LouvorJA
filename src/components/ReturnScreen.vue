<template>
  <div class="w-100 h-100 d-flex flex-column justify-space-between pa-8 return-screen" :style="style_bg">
    <div v-if="is_external_media_active" class="d-flex flex-column align-center justify-center flex-grow-1 position-relative" style="min-height: 0;">
      <div v-if="external_media_is_image" class="w-100 h-100 position-relative d-flex align-center justify-center">
        <img :src="external_media_resolved_path" class="media-preview-img" />
        <div v-if="external_media_gallery_count > 1" class="media-gallery-counter">
          {{ external_media_slide_index + 1 }} / {{ external_media_gallery_count }}
        </div>
      </div>
      <div v-else-if="external_media_is_video" class="w-100 h-100 d-flex align-center justify-center">
        <video
          ref="returnVideo"
          :src="external_media_resolved_path"
          class="media-preview-img"
          muted
          @canplay="onReturnVideoCanPlay"
        />
      </div>
      <div v-else class="text-center current-lyric" style="opacity: 0.5;">
        <v-icon size="64" class="mb-2 d-block mx-auto">
          mdi-music-circle
        </v-icon>
        {{ external_media_title }}
      </div>
    </div>
    <div v-else class="d-flex flex-column align-center justify-center flex-grow-1" style="gap: 24px;">
      <div v-if="main_text && is_bible_active" class="text-center current-lyric" :style="{ fontSize: bible_font_size }">
        {{ main_text }}
      </div>
      <div v-else-if="main_text" class="text-center current-lyric" v-html="main_text" />
      <div v-else-if="!is_timer_active" class="text-center current-lyric" style="opacity: 0.5;">
        {{ is_bible_active ? t("return_screen_no_verse") : t("return_screen_pause") }}
      </div>

      <div v-if="secondary_text && is_bible_active" class="text-center next-lyric">
        {{ secondary_text }}
      </div>
      <div v-else-if="secondary_text" class="text-center next-lyric" v-html="secondary_text" />
    </div>

    <div class="return-divider" :style="{ backgroundColor: font_color }" />
  </div>
</template>

<script>
import $media from "@/helpers/Media";
import $mediaType from "@/helpers/MediaType";

export default {
  name: "ReturnScreenComponent",
  computed: {
    popup_module() {
      return this.$appdata.get("popup_module");
    },
    is_bible_active() {
      return this.popup_module === "bible";
    },
    is_external_media_active() {
      return this.popup_module === "external_media";
    },
    // Com o cronômetro projetado, o TimerOverlay já ocupa a tela — o texto de
    // "Pausa" atrás dele só polui a tela de retorno.
    is_timer_active() {
      return this.popup_module === "timer" && !!this.$appdata.get("timer.started");
    },
    external_media_raw_path() {
      return this.$appdata.get("modules.external_media.filePath") || "";
    },
    external_media_raw_paths() {
      const arr = this.$appdata.get("modules.external_media.filePaths");
      return Array.isArray(arr) && arr.length > 1 ? arr : (this.external_media_raw_path ? [this.external_media_raw_path] : []);
    },
    external_media_gallery_count() {
      return this.external_media_raw_paths.length;
    },
    external_media_slide_index() {
      const idx = this.$appdata.get("modules.external_media.config.slide_index") || 0;
      return Math.min(Math.max(idx, 0), Math.max(this.external_media_raw_paths.length - 1, 0));
    },
    external_media_current_raw_path() {
      return this.external_media_gallery_count > 1
        ? (this.external_media_raw_paths[this.external_media_slide_index] || this.external_media_raw_path)
        : this.external_media_raw_path;
    },
    external_media_resolved_path() {
      const raw = this.external_media_current_raw_path;
      if (!raw) return "";
      if (window.electronAPI) {
        const prefix = raw.startsWith("/") ? "local://app" : "local://app/";
        return `${prefix}${raw}`;
      }
      return raw;
    },
    external_media_is_video() {
      return $mediaType.isVideo(this.external_media_raw_path);
    },
    external_media_is_image() {
      return $mediaType.isImage(this.external_media_raw_path);
    },
    external_media_title() {
      return this.$appdata.get("modules.external_media.title") || "Mídia Externa";
    },
    external_media_current_time() {
      return this.$appdata.get("modules.external_media.config.current_time");
    },
    external_media_is_paused() {
      return this.$appdata.get("modules.external_media.config.is_paused");
    },
    bible_data() {
      return this.$appdata.get("modules.bible.data") || {};
    },
    main_text() {
      return this.is_bible_active ? this.bible_data.text : this.current_lyric;
    },
    secondary_text() {
      return this.is_bible_active ? this.bible_data.scriptural_reference : this.next_lyric;
    },
    bible_font_size() {
      const len = (this.main_text || "").length;
      if (len <= 70) return "5vw";
      if (len <= 140) return "3.8vw";
      if (len <= 220) return "3vw";
      if (len <= 320) return "2.4vw";
      return "1.9vw";
    },
    background_color() {
      return this.$userdata.get("modules.config.return_screen_bg_color") || "#000000";
    },
    font_color() {
      return this.$userdata.get("modules.config.return_screen_font_color") || "#ffffff";
    },
    style_bg() {
      return {
        backgroundColor: this.background_color,
        color: this.font_color,
      };
    },
    config() {
      return $media.config() || {};
    },
    slides() {
      return $media.slides() ?? [];
    },
    slide_index() {
      return this.config.slide_index ?? 0;
    },
    current_slide() {
      return this.slides[this.slide_index];
    },
    next_slide() {
      return this.slides[this.slide_index + 1];
    },
    current_lyric() {
      return this.current_slide?.lyric;
    },
    next_lyric() {
      return this.next_slide?.lyric;
    },
  },
  watch: {
    external_media_current_time(val) {
      const video = this.$refs.returnVideo;
      if (video && !video.seeking) {
        if (Math.abs(video.currentTime - val) > 0.5) {
          video.currentTime = val;
        }
      }
    },
    external_media_is_paused(val) {
      this.$nextTick(() => {
        const video = this.$refs.returnVideo;
        if (!video) return;
        if (val) {
          video.pause();
        } else {
          video.play().catch(() => {});
        }
      });
    },
  },
  methods: {
    t(text) {
      return this.$t(`modules.config.${text}`);
    },
    onReturnVideoCanPlay() {
      const video = this.$refs.returnVideo;
      if (video && !this.external_media_is_paused) {
        video.currentTime = this.external_media_current_time || 0;
        video.play().catch(() => {});
      }
    },
  },
};
</script>

<style scoped>
.return-screen {
  text-transform: uppercase;
}
.current-lyric {
  font-size: 6vw;
  font-weight: 700;
  line-height: 1.3;
  text-shadow: 0px 4px 16px rgba(0, 0, 0, 0.6);
}
.next-lyric {
  font-size: 3vw;
  font-weight: 500;
  opacity: 0.6;
  line-height: 1.3;
}
.return-divider {
  width: 100%;
  height: 2px;
  opacity: 0.25;
  border-radius: 1px;
}
.media-preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.media-gallery-counter {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: none;
}
</style>
