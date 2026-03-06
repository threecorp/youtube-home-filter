"use strict";

const DEFAULT_SETTINGS = {
  globalEnabled: true,
  viewCountEnabled: false,
  viewCountMin: 0,
  viewCountMax: 0,
  publishDateEnabled: false,
  publishDateMaxDays: 0,
  filterMode: "or",
};

const elements = {};

function initElements() {
  elements.globalEnabled = document.getElementById("globalEnabled");
  elements.viewCountEnabled = document.getElementById("viewCountEnabled");
  elements.viewCountMin = document.getElementById("viewCountMin");
  elements.viewCountMax = document.getElementById("viewCountMax");
  elements.viewCountBody = document.getElementById("viewCountBody");
  elements.publishDateEnabled = document.getElementById("publishDateEnabled");
  elements.publishDateMaxDays = document.getElementById("publishDateMaxDays");
  elements.publishDateBody = document.getElementById("publishDateBody");
  elements.modeOr = document.getElementById("modeOr");
  elements.modeAnd = document.getElementById("modeAnd");
  elements.modeHint = document.getElementById("modeHint");
  elements.status = document.getElementById("status");
}

function updateBodyVisibility() {
  elements.viewCountBody.classList.toggle(
    "active",
    elements.viewCountEnabled.checked
  );
  elements.publishDateBody.classList.toggle(
    "active",
    elements.publishDateEnabled.checked
  );
}

function getSettingsFromUI() {
  return {
    globalEnabled: elements.globalEnabled.checked,
    viewCountEnabled: elements.viewCountEnabled.checked,
    viewCountMin: parseInt(elements.viewCountMin.value, 10) || 0,
    viewCountMax: parseInt(elements.viewCountMax.value, 10) || 0,
    publishDateEnabled: elements.publishDateEnabled.checked,
    publishDateMaxDays: parseInt(elements.publishDateMaxDays.value, 10) || 0,
    filterMode: elements.modeOr.classList.contains("active") ? "or" : "and",
  };
}

function updateModeUI(mode) {
  elements.modeOr.classList.toggle("active", mode === "or");
  elements.modeAnd.classList.toggle("active", mode === "and");
  elements.modeHint.textContent =
    mode === "or"
      ? "Hide if ANY filter condition is not met"
      : "Hide only if ALL filter conditions are not met";
}

function applySettingsToUI(s) {
  elements.globalEnabled.checked = s.globalEnabled;
  elements.viewCountEnabled.checked = s.viewCountEnabled;
  elements.viewCountMin.value = s.viewCountMin;
  elements.viewCountMax.value = s.viewCountMax;
  elements.publishDateEnabled.checked = s.publishDateEnabled;
  elements.publishDateMaxDays.value = s.publishDateMaxDays;
  updateModeUI(s.filterMode);
  updateBodyVisibility();
}

function showStatus(msg) {
  elements.status.textContent = msg;
  setTimeout(() => {
    elements.status.textContent = "";
  }, 1500);
}

function saveSettings() {
  const s = getSettingsFromUI();
  chrome.storage.sync.set(s, () => {
    showStatus("Settings saved");

    // Notify content script in all YouTube tabs
    chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
      for (const tab of tabs) {
        try {
          chrome.tabs.sendMessage(
            tab.id,
            { type: "settingsUpdated", settings: s },
            () => chrome.runtime.lastError // suppress error for tabs without listener
          );
        } catch (_) { /* ignore */ }
      }
    });
  });
}

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
    applySettingsToUI({ ...DEFAULT_SETTINGS, ...result });
  });
}

function bindEvents() {
  // Global toggle
  elements.globalEnabled.addEventListener("change", () => {
    saveSettings();
  });

  // Toggle visibility on checkbox change
  elements.viewCountEnabled.addEventListener("change", () => {
    updateBodyVisibility();
    saveSettings();
  });
  elements.publishDateEnabled.addEventListener("change", () => {
    updateBodyVisibility();
    saveSettings();
  });

  // Save on input change (debounced)
  let debounceTimer;
  const debouncedSave = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(saveSettings, 400);
  };

  elements.viewCountMin.addEventListener("input", debouncedSave);
  elements.viewCountMax.addEventListener("input", debouncedSave);
  elements.publishDateMaxDays.addEventListener("input", debouncedSave);

  // Filter mode buttons
  elements.modeOr.addEventListener("click", () => {
    updateModeUI("or");
    saveSettings();
  });
  elements.modeAnd.addEventListener("click", () => {
    updateModeUI("and");
    saveSettings();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initElements();
  loadSettings();
  bindEvents();
});
