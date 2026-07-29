<template>
  <ModuleContainer ref="moduleContainer" :manifest="manifest">
    <template v-slot:header>
      <v-toolbar>
        <v-text-field
          v-model.number="minutes"
          type="number"
          min="0"
          max="999"
          density="compact"
          variant="outlined"
          hide-details
          :label="$t('modules.cronometro.minutes')"
          style="max-width: 90px"
          class="mx-1"
          :disabled="running"
        />
        <v-text-field
          v-model.number="seconds"
          type="number"
          min="0"
          max="59"
          density="compact"
          variant="outlined"
          hide-details
          :label="$t('modules.cronometro.seconds')"
          style="max-width: 90px"
          class="mx-1"
          :disabled="running"
        />
        <v-btn
          :icon="running ? 'mdi-pause' : 'mdi-play'"
          variant="outlined"
          class="mx-1"
          @click="toggle"
        />
        <v-btn
          icon="mdi-restart"
          variant="outlined"
          class="mx-1"
          @click="reset"
        />
        <v-spacer />
        <v-divider vertical />
        <LScreenBtn module="cronometro" />
      </v-toolbar>
    </template>
    <Screen />
  </ModuleContainer>
</template>

<script>
import Screen from "../components/Screen.vue";
import LScreenBtn from "@/components/buttons/Screen.vue";

export default {
  name: manifest.id,
  components: {
    ModuleContainer,
    Screen,
    LScreenBtn,
  },
  computed: {
    duration: {
      get() {
        return this.$appdata.get("cronometro.duration", 300);
      },
      set(value) {
        this.$appdata.set("cronometro.duration", value);
      },
    },
    remaining: {
      get() {
        return this.$appdata.get("cronometro.remaining", 0);
      },
      set(value) {
        this.$appdata.set("cronometro.remaining", value);
      },
    },
    running() {
      return this.$appdata.get("cronometro.running", false);
    },
    minutes: {
      get() {
        return Math.floor(this.duration / 60);
      },
      set(value) {
        this.updateDuration(Math.max(0, value || 0), this.duration % 60);
      },
    },
    seconds: {
      get() {
        return this.duration % 60;
      },
      set(value) {
        this.updateDuration(
          Math.floor(this.duration / 60),
          Math.max(0, Math.min(59, value || 0))
        );
      },
    },
  },
  methods: {
    updateDuration(minutes, seconds) {
      const total = minutes * 60 + seconds;
      this.duration = total;
      if (!this.running) {
        this.remaining = total;
      }
    },
    toggle() {
      if (this.remaining <= 0) {
        this.remaining = this.duration;
      }
      this.$appdata.set("cronometro.running", !this.running);
    },
    reset() {
      this.$appdata.set("cronometro.running", false);
      this.remaining = this.duration;
    },
  },
};
</script>

<!-- ########################################################### -->
<!-- ####### SETUP OBRIGATÓRIA PARA INSTALAÇÃO DO MODULO ####### -->
<!-- ########################################################### -->
<script setup>
import manifest from "../manifest.json";
import ModuleContainer from "@/layout/ModuleContainer.vue";
import { ref } from "vue";
const moduleContainer = ref(null);
</script>
<!-- ########################################################### -->
<!-- ########################################################### -->
<!-- ########################################################### -->
