"use strict";

// Forward settings changes to all YouTube content scripts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  chrome.storage.sync.get(null, (settings) => {
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: "settingsUpdated", settings },
          () => void chrome.runtime.lastError
        );
      }
    });
  });
});
