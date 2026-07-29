<template>
  <div
    ref="container"
    class="d-flex align-center justify-center"
    :style="{
      background: '#000',
      width: '100%',
      height: height ? height + 'px' : '100%',
      color: '#fff',
    }"
  >
    <span class="text-right" :style="{ fontSize: `${this.fontSizePc(30)}px` }">
      {{ time }}
    </span>
  </div>
</template>

<script>
export default {
  name: "CronometroPage",
  props: {
    height: Number,
  },
  data: () => ({
    s_width: 0,
    s_height: 0,
    timer: null,
  }),
  computed: {
    is_popup() {
      return this.$appdata.get("is_popup", false);
    },
    remaining() {
      return this.$appdata.get("cronometro.remaining", 0);
    },
    time() {
      const total = Math.max(0, this.remaining);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const pad = (n) => String(n).padStart(2, "0");
      return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    },
  },
  methods: {
    fontSizePc(pc) {
      const v = Math.min(this.s_width, this.s_height);
      return (pc * v) / 100 / 2;
    },
    windowResize() {
      const container = this.$refs.container;
      if (container) {
        this.s_width = container.offsetWidth;
        this.s_height = container.offsetHeight;

        if (this.width <= 0 || this.height <= 0) {
          const self = this;
          setTimeout(function () {
            self.windowResize();
          }, 100);
        }
      }
    },
    tick() {
      if (!this.$appdata.get("cronometro.running", false)) {
        return;
      }
      const remaining = this.$appdata.get("cronometro.remaining", 0);
      if (remaining <= 0) {
        this.$appdata.set("cronometro.running", false);
        return;
      }
      this.$appdata.set("cronometro.remaining", remaining - 1);
    },
  },
  mounted() {
    this.windowResize();
    window.addEventListener("resize", this.windowResize);

    // Somente a janela principal avança a contagem; o popup apenas exibe
    // o valor sincronizado, evitando decrementar em dobro.
    if (!this.is_popup) {
      this.timer = setInterval(this.tick, 1000);
    }
  },
  unmounted() {
    window.removeEventListener("resize", this.windowResize);
    clearInterval(this.timer);
  },
};
</script>
