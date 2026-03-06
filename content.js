"use strict";

(() => {
  // Default settings
  const DEFAULT_SETTINGS = {
    globalEnabled: true,
    viewCountEnabled: false,
    viewCountMin: 0,
    viewCountMax: 0, // 0 = unlimited
    publishDateEnabled: false,
    publishDateMaxDays: 0, // 0 = unlimited
    filterMode: "or", // "or" = must pass ALL, "and" = pass ANY
  };

  let settings = { ...DEFAULT_SETTINGS };

  // ─── Home Page Detection ──────────────────────────────────────────

  function isHomePage() {
    return location.pathname === "/";
  }

  function activateFilter() {
    document.documentElement.classList.add("yt-filter-active");
  }

  function deactivateFilter() {
    document.documentElement.classList.remove("yt-filter-active");
    // Remove all filter marks so videos display normally
    document.querySelectorAll("[data-yt-filtered]").forEach((el) => {
      el.removeAttribute("data-yt-filtered");
    });
  }

  // ─── View Count Parsing ───────────────────────────────────────────

  const VIEW_COUNT_MULTIPLIERS_EN = {
    K: 1_000,
    M: 1_000_000,
    B: 1_000_000_000,
  };

  const VIEW_COUNT_MULTIPLIERS_JP = {
    "\u4E07": 10_000, // 万
    "\u5104": 100_000_000, // 億
  };

  /**
   * Parse view count string to a number.
   * Supports: "16M views", "1.2K views", "123 views",
   *           "100万 回視聴", "1.2万 回視聴", "123 回視聴"
   */
  function parseViewCount(text) {
    if (!text) return null;
    const trimmed = text.trim();

    // English: "1.2M views", "16K views", "123 views"
    const enMatch = trimmed.match(
      /^([\d,.]+)\s*([KMB])?\s*views?/i
    );
    if (enMatch) {
      const num = parseFloat(enMatch[1].replace(/,/g, ""));
      const suffix = enMatch[2] ? enMatch[2].toUpperCase() : null;
      const multiplier = suffix ? VIEW_COUNT_MULTIPLIERS_EN[suffix] : 1;
      return Math.round(num * multiplier);
    }

    // Japanese: "100万 回視聴", "1.2万 回視聴", "123 回視聴"
    const jpMatch = trimmed.match(
      /^([\d,.]+)\s*([万億])?\s*回/
    );
    if (jpMatch) {
      const num = parseFloat(jpMatch[1].replace(/,/g, ""));
      const suffix = jpMatch[2] || null;
      const multiplier = suffix ? VIEW_COUNT_MULTIPLIERS_JP[suffix] : 1;
      return Math.round(num * multiplier);
    }

    // Fallback: try to extract any number
    const fallback = trimmed.match(/^([\d,.]+)/);
    if (fallback) {
      return Math.round(parseFloat(fallback[1].replace(/,/g, "")));
    }

    return null;
  }

  // ─── Publish Date Parsing ─────────────────────────────────────────

  const TIME_UNITS_EN = {
    second: 1 / 86400,
    minute: 1 / 1440,
    hour: 1 / 24,
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };

  const TIME_UNITS_JP = {
    "\u79D2": 1 / 86400, // 秒
    "\u5206": 1 / 1440, // 分
    "\u6642\u9593": 1 / 24, // 時間
    "\u65E5": 1, // 日
    "\u9031\u9593": 7, // 週間
    "\u304B\u6708": 30, // か月
    "\u30F6\u6708": 30, // ヶ月
    "\u5E74": 365, // 年
  };

  /**
   * Parse relative date string to number of days ago.
   * Supports: "6 years ago", "3 months ago", "2 days ago",
   *           "6年前", "3か月前", "2日前"
   */
  function parsePublishDate(text) {
    if (!text) return null;
    const trimmed = text.trim();

    // English: "6 years ago", "3 months ago", "Streamed 1 year ago"
    const enMatch = trimmed.match(
      /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i
    );
    if (enMatch) {
      const num = parseInt(enMatch[1], 10);
      const unit = enMatch[2].toLowerCase();
      return Math.round(num * (TIME_UNITS_EN[unit] || 1));
    }

    // Japanese: "6年前", "3か月前", "2日前", "5時間前"
    const jpMatch = trimmed.match(
      /(\d+)\s*(秒|分|時間|日|週間|か月|ヶ月|年)\s*前/
    );
    if (jpMatch) {
      const num = parseInt(jpMatch[1], 10);
      const unit = jpMatch[2];
      return Math.round(num * (TIME_UNITS_JP[unit] || 1));
    }

    return null;
  }

  // ─── Metadata Extraction ──────────────────────────────────────────

  /**
   * Try to extract metadata from the new yt-content-metadata-view-model component.
   * Used by both ytd-rich-item-renderer (home) and yt-lockup-view-model (sidebar).
   */
  function extractFromContentMetadataViewModel(element) {
    const metaView = element.querySelector("yt-content-metadata-view-model");
    if (!metaView) return null;

    const rows = metaView.querySelectorAll(
      ".yt-content-metadata-view-model__metadata-row"
    );
    // Row 0 = channel name, Row 1 = view count + publish date
    if (rows.length < 2) return null;

    const texts = rows[1].querySelectorAll(
      ".yt-content-metadata-view-model__metadata-text"
    );
    if (texts.length < 2) return null;

    return {
      viewCountText: texts[0].textContent,
      publishDateText: texts[texts.length - 1].textContent,
    };
  }

  /**
   * Try to extract metadata from the legacy #metadata-line structure.
   * Used by ytd-video-renderer (search results) and possibly older ytd-rich-item-renderer.
   */
  function extractFromMetadataLine(element) {
    const metadataLine = element.querySelector("#metadata-line");
    if (!metadataLine) return null;

    const spans = metadataLine.querySelectorAll("span.inline-metadata-item");
    if (spans.length < 2) return null;

    return {
      viewCountText: spans[0].textContent,
      publishDateText: spans[1].textContent,
    };
  }

  /**
   * Extract view count and publish date text from a video element.
   * Returns { viewCountText, publishDateText } or null.
   */
  function extractMetadata(element) {
    // Try new component structure first (home page, sidebar)
    const fromViewModel = extractFromContentMetadataViewModel(element);
    if (fromViewModel) return fromViewModel;

    // Fall back to legacy structure (search results)
    return extractFromMetadataLine(element);
  }

  // ─── Filtering Logic ──────────────────────────────────────────────

  /**
   * Check if video passes the view count filter.
   * Returns null if filter is disabled or can't be evaluated.
   */
  function passesViewCountFilter(metadata) {
    if (!settings.viewCountEnabled) return null;
    // No thresholds set = filter not meaningful
    if (settings.viewCountMin <= 0 && settings.viewCountMax <= 0) return null;
    const viewCount = parseViewCount(metadata.viewCountText);
    if (viewCount === null) return null;
    if (settings.viewCountMin > 0 && viewCount < settings.viewCountMin) return false;
    if (settings.viewCountMax > 0 && viewCount > settings.viewCountMax) return false;
    return true;
  }

  /**
   * Check if video passes the publish date filter.
   * Returns null if filter is disabled or can't be evaluated.
   */
  function passesPublishDateFilter(metadata) {
    if (!settings.publishDateEnabled) return null;
    // No threshold set = filter not meaningful
    if (settings.publishDateMaxDays <= 0) return null;
    const daysAgo = parsePublishDate(metadata.publishDateText);
    if (daysAgo === null) return null;
    if (daysAgo > settings.publishDateMaxDays) return false;
    return true;
  }

  /**
   * Determine if a video should be shown based on current settings.
   * OR mode: show if ANY enabled filter passes (e.g. high views OR recent).
   * AND mode: show only if ALL enabled filters pass (e.g. high views AND recent).
   */
  function shouldShowVideo(metadata) {
    if (!settings.globalEnabled) return true; // Global off -> show all
    if (!metadata) return true; // Can't parse -> show

    const results = [
      passesViewCountFilter(metadata),
      passesPublishDateFilter(metadata),
    ];

    // Only consider filters that returned a boolean (not null)
    const active = results.filter((r) => r !== null);
    if (active.length === 0) return true; // No active filters -> show

    if (settings.filterMode === "or") {
      // OR: hide if ANY filter fails (= must pass ALL to show)
      return active.every((r) => r === true);
    }
    // AND: hide only if ALL filters fail (= pass ANY to show)
    return active.some((r) => r === true);
  }

  /**
   * Filter a single video element.
   */
  function filterElement(element) {
    const metadata = extractMetadata(element);
    const show = shouldShowVideo(metadata);
    element.setAttribute("data-yt-filtered", show ? "show" : "hide");
  }

  /**
   * Filter all video elements on the page.
   */
  function filterAllVideos() {
    if (!isHomePage()) return;
    const elements = document.querySelectorAll("ytd-rich-item-renderer");
    elements.forEach(filterElement);
  }

  /**
   * Re-filter: remove existing marks and re-apply.
   */
  function refilterAll() {
    if (!isHomePage()) {
      deactivateFilter();
      return;
    }
    activateFilter();
    const elements = document.querySelectorAll("ytd-rich-item-renderer");
    elements.forEach((el) => {
      el.removeAttribute("data-yt-filtered");
      filterElement(el);
    });
  }

  // ─── MutationObserver ─────────────────────────────────────────────

  function handleMutations(mutations) {
    if (!isHomePage()) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.tagName === "YTD-RICH-ITEM-RENDERER") {
          filterElement(node);
          continue;
        }

        const children = node.querySelectorAll
          ? node.querySelectorAll("ytd-rich-item-renderer")
          : [];
        children.forEach(filterElement);
      }
    }
  }

  const observer = new MutationObserver(handleMutations);

  function startObserver() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ─── SPA Navigation Handling ──────────────────────────────────────

  document.addEventListener("yt-navigate-finish", () => {
    refilterAll();
  });

  document.addEventListener("yt-page-data-updated", () => {
    refilterAll();
  });

  // ─── Settings Management ──────────────────────────────────────────

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
        settings = { ...DEFAULT_SETTINGS, ...result };
        resolve(settings);
      });
    });
  }

  // Listen for settings changes from popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "settingsUpdated") {
      settings = { ...DEFAULT_SETTINGS, ...message.settings };
      refilterAll();
    }
  });

  // Also listen for storage changes (covers cross-tab sync)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) {
        settings[key] = newValue;
      }
    }
    refilterAll();
  });

  // ─── Initialization ───────────────────────────────────────────────

  async function init() {
    await loadSettings();
    if (isHomePage()) {
      activateFilter();
      filterAllVideos();
    }
    startObserver();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
