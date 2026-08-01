import $appdata from "@/helpers/AppData";
import $userdata from "@/helpers/UserData";
import $window from "@/helpers/Window";
import { markRaw } from "vue";

function splitPopups() {
  const popups = ($appdata.get("popups") || []).filter(p => !p.closed);
  return {
    mainPopups: popups.filter(p => p.role !== "return"),
    returnPopups: popups.filter(p => p.role === "return"),
  };
}

// A tela de retorno espelha o que está sendo projetado. Por isso quem decide se
// ela existe é o módulo em projeção (popup_module) — e não apenas haver conteúdo
// carregado no app. Sem projeção a janela é fechada de verdade, revelando o papel
// de parede e deixando a barra de status/relógio à vista.
function isReturnContentActive() {
  switch ($appdata.get("popup_module")) {
    case "media":
      return $appdata.get("modules.media.id_music") != null;
    case "bible":
      return !!$appdata.get("modules.bible.data.text");
    case "external_media":
      return !!$appdata.get("modules.external_media.filePath");
    case "timer":
      return !!$appdata.get("timer.started");
    default:
      return false;
  }
}

// Janelas de barra (status/relógio da tela de retorno, aviso sob demanda).
// Ficam num array próprio, separado de "popups", pra nunca serem afetadas
// pelas rotinas de criar/destruir das janelas de conteúdo acima.
function getBarPopups() {
  return ($appdata.get("barPopups") || []).filter(p => !p.closed);
}

function setBarPopups(list) {
  $appdata.set("barPopups", list);
}

async function resolveNoticeMonitors(target) {
  if (target === "return") {
    const monitorId = $userdata.get("modules.config.return_screen_monitor");
    return monitorId ? [monitorId] : [null];
  }

  let configMonitors = $userdata.get("modules.config.slide_monitor");
  if (!Array.isArray(configMonitors)) {
    configMonitors = configMonitors ? [configMonitors] : [];
  }
  return configMonitors.length > 0 ? configMonitors : [null];
}

function setPopups(mainPopups, returnPopups) {
  $appdata.set("popups", [...mainPopups, ...returnPopups]);
  $appdata.set("popup", mainPopups.length > 0 ? mainPopups[0] : null);
}

async function applyReturnMonitor(monitorId) {
  const { mainPopups, returnPopups } = splitPopups();
  const enabled = !!monitorId && isReturnContentActive();

  if (!enabled) {
    returnPopups.forEach(popup => popup.close());
    $appdata.set("popups", mainPopups);
    return;
  }

  let keep = returnPopups.find(popup => popup.monitorId === monitorId);
  returnPopups.forEach(popup => {
    if (popup !== keep) {
      popup.close();
    }
  });

  if (!keep) {
    const features = `width=800,height=600,monitor=${monitorId},fullscreen=yes`;
    const newPopup = $window.open("#/popup?role=return", `PopupReturnWindow_${monitorId}`, features);
    newPopup.monitorId = monitorId;
    newPopup.role = "return";
    keep = markRaw(newPopup);
  }

  $appdata.set("popups", [...mainPopups, keep]);
}

// Reavalia a tela de retorno após qualquer mudança na projeção principal, para
// que abrir/fechar/trocar de módulo nunca a deixe presa num estado antigo (ex.:
// parada na tela de pausa, cobrindo o papel de parede e a barra de status).
async function refreshReturnMonitor() {
  await applyReturnMonitor($userdata.get("modules.config.return_screen_monitor"));
}

export default {
  async open(params) {
    if (typeof params !== "object") {
      params = { module: params };
    }

    // Só as janelas de conteúdo entram aqui: a janela da tela de retorno tem
    // ciclo de vida próprio e não pode ser focada nem descartada no lugar delas.
    const { mainPopups, returnPopups } = splitPopups();
    let popups = mainPopups;

    if (params.monitorId) {
      const existing = popups.find(p => p.monitorId === params.monitorId);
      if (existing) {
        existing.focus();
      } else {
        let features = `width=800,height=600,monitor=${params.monitorId}`;
        if (params.fullscreen) features += ",fullscreen=yes";
        const newPopup = $window.open("#/popup", `PopupWindow_${params.monitorId}`, features);
        newPopup.monitorId = params.monitorId;
        popups = [...popups, markRaw(newPopup)];
      }
    } else if (popups.length > 0) {
      popups[0].focus();
    } else {
      let features = "width=800,height=600";
      if (params.fullscreen) features += ",fullscreen=yes";
      popups = [markRaw($window.open("#/popup", "PopupWindow", features))];
    }

    $appdata.set("popup_module", params.module);
    setPopups(popups, returnPopups);

    await refreshReturnMonitor();
  },
  async exit() {
    const { mainPopups, returnPopups } = splitPopups();
    mainPopups.forEach(popup => popup.close());
    $appdata.set("popup_module", "");
    setPopups([], returnPopups);

    await refreshReturnMonitor();
  },
  async syncMonitors(monitors, moduleName = "media", forceOpen = false) {
    const split = splitPopups();
    const { returnPopups } = split;
    let { mainPopups } = split;

    mainPopups.forEach(popup => {
      if (popup.monitorId && !monitors.includes(popup.monitorId)) {
        popup.close();
      }
    });
    mainPopups = mainPopups.filter(p => !p.closed);

    if ($appdata.get("popup_module") === moduleName || forceOpen) {
      for (const monitorId of monitors) {
        const existing = mainPopups.find(p => p.monitorId === monitorId);
        if (!existing || existing.closed) {
          const features = `width=800,height=600,monitor=${monitorId},fullscreen=yes`;
          const newPopup = $window.open("#/popup", `PopupWindow_${monitorId}`, features);
          newPopup.monitorId = monitorId;
          mainPopups.push(markRaw(newPopup));
        }
      }
      if (monitors.length > 0) {
        $appdata.set("popup_module", moduleName);
      } else if (mainPopups.length === 0) {
        $appdata.set("popup_module", "");
      }
    }

    setPopups(mainPopups, returnPopups);

    await refreshReturnMonitor();
  },
  async syncReturnMonitor(monitorId) {
    await applyReturnMonitor(monitorId);
  },
  async projectModule(moduleName) {
    let selectedMonitors = [];
    if (window.electronAPI && window.electronAPI.getDisplays) {
      const displays = await window.electronAPI.getDisplays();
      if (displays && displays.length > 1) {
        let configMonitors = $userdata.get("modules.config.slide_monitor");
        if (!Array.isArray(configMonitors)) {
          configMonitors = configMonitors ? [configMonitors] : [];
        }
        const primary = displays.find(d => d.isPrimary) || displays[0];
        selectedMonitors = configMonitors.filter(m => m !== primary.id);
      }
    }

    if (selectedMonitors.length > 0) {
      await this.syncMonitors(selectedMonitors, moduleName, true);
    } else {
      const fullscreen = $userdata.get("modules.config.slide_fullscreen") !== false;
      await this.open({ module: moduleName, fullscreen });
    }
  },
  async exitReturn() {
    const { mainPopups, returnPopups } = splitPopups();
    returnPopups.forEach(popup => popup.close());
    $appdata.set("popups", mainPopups);
  },

  // Barra de status/relógio da tela de retorno: sempre viva, independente do
  // estado da janela de conteúdo. Nasce/reposiciona quando o monitor de
  // retorno é configurado; fecha quando a configuração é removida.
  async syncStatusBar(monitorId, force = false) {
    const current = getBarPopups();
    const existing = current.find(p => p.role === "status");

    if (!monitorId) {
      if (existing) existing.close();
      setBarPopups(current.filter(p => p.role !== "status"));
      return;
    }

    if (existing && existing.monitorId === monitorId && !force) {
      return;
    }
    if (existing) {
      existing.close();
    }

    const size = $userdata.get("modules.config.return_status_bar_size") || 7;
    const features = `bar=bottom,monitor=${monitorId},size=${size}`;
    const win = markRaw($window.open("#/popup?role=status", `StatusBarWindow_${monitorId}_${Date.now()}`, features));
    win.monitorId = monitorId;
    win.role = "status";

    setBarPopups([...current.filter(p => p.role !== "status"), win]);
  },
  async closeStatusBar() {
    const current = getBarPopups();
    current.filter(p => p.role === "status").forEach(p => p.close());
    setBarPopups(current.filter(p => p.role !== "status"));
  },

  // Barra de aviso: sob demanda, manual. Um aviso ativo por vez nesta versão,
  // exibido na(s) tela(s) escolhida(s) pelo operador no momento do disparo.
  async showNotice({ text, targets }) {
    if (!text || !Array.isArray(targets) || targets.length === 0) return;

    const current = getBarPopups();
    current.filter(p => p.role === "notice").forEach(p => p.close());
    const statusOnly = current.filter(p => p.role === "status");

    $appdata.set("notice.text", text);
    $appdata.set("notice.visible", true);

    const size = $userdata.get("modules.config.notice_bar_size") || 7;
    const windows = [];
    for (const target of targets) {
      const monitorIds = await resolveNoticeMonitors(target);
      for (const monitorId of monitorIds) {
        const features = monitorId ? `bar=top,monitor=${monitorId},size=${size}` : `bar=top,size=${size}`;
        const name = `NoticeWindow_${target}_${monitorId ?? "primary"}_${Date.now()}`;
        const win = markRaw($window.open("#/popup?role=notice", name, features));
        win.role = "notice";
        win.noticeTarget = target;
        windows.push(win);
      }
    }

    setBarPopups([...statusOnly, ...windows]);
  },
  async hideNotice() {
    const current = getBarPopups();
    current.filter(p => p.role === "notice").forEach(p => p.close());
    setBarPopups(current.filter(p => p.role !== "notice"));
    $appdata.set("notice.visible", false);
  },
};
