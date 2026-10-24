// SkipMe content script
// This script runs on YouTube pages and automatically clicks the "Skip Ad" button
// as soon as it appears.

(function () {
  'use strict';

  let isEnabled = true;
  let skipCount = 0;
  let lastClickAt = 0;
  let pendingSkip = false;
  let resultVisibleUntil = 0;
  const CLICK_COOLDOWN_MS = 1500;

  // Check if the extension is enabled and restore its count.
  chrome.storage.local.get(['enabled', 'skipCount'], (result) => {
    if (result.enabled === false) {
      isEnabled = false;
    }
    skipCount = typeof result.skipCount === 'number' ? result.skipCount : 0;
  });

  // Listen for messages from popup to toggle
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
      isEnabled = message.enabled;
      sendResponse({ success: true, enabled: isEnabled });
    } else if (message.action === 'getStatus') {
      sendResponse({ enabled: isEnabled, skipCount });
    }
  });

  // Selectors for YouTube's skip button
  const SKIP_BUTTON_SELECTORS = [
    'button.ytp-skip-ad-button:not([disabled])',
    'button.ytp-ad-skip-button:not([disabled])',
    'button.ytp-ad-skip-button-modern:not([disabled])',
  ];

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function isAdContext(element) {
    return Boolean(element.closest('.ad-showing, .ytp-ad-player-overlay, .ytp-ad-skip-button-slot, [class*="ad-interrupt"]'));
  }

  function showDebugOverlay(element, message) {
    let overlay = document.getElementById('youtube-ad-skipper-debug');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'youtube-ad-skipper-debug';
      overlay.style.position = 'fixed';
      overlay.style.zIndex = '2147483647';
      overlay.style.pointerEvents = 'none';
      overlay.style.fontFamily = 'Arial, sans-serif';
      overlay.style.fontSize = '13px';
      overlay.style.fontWeight = '700';
      overlay.style.color = '#fff';
      overlay.style.textShadow = '0 1px 3px #000, 0 0 2px #000';
      document.documentElement.appendChild(overlay);
    }

    const rect = element.getBoundingClientRect();
    overlay.textContent = message;
    overlay.style.left = `${Math.max(4, rect.left + rect.width / 2)}px`;
    overlay.style.top = `${Math.max(4, rect.top - 42)}px`;
    overlay.style.width = 'auto';
    overlay.style.height = 'auto';
    overlay.style.transform = 'translateX(-50%)';
  }

  function hideDebugOverlay() {
    document.getElementById('youtube-ad-skipper-debug')?.remove();
  }

  function activateSkipButton(element) {
    const rect = element.getBoundingClientRect();
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'clickSkipButton',
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response?.success) {
          reject(new Error(response?.error || 'Debugger click failed'));
        } else {
          resolve();
        }
      });
    });
  }

  // Find the skip button on the page
  function findSkipButton() {
    for (const selector of SKIP_BUTTON_SELECTORS) {
      const button = document.querySelector(selector);
      if (button && isVisible(button) && isAdContext(button)) {
        if (Date.now() >= resultVisibleUntil) {
          showDebugOverlay(button, 'SkipMe...');
        }
        return button;
      }
    }
    return null;
  }

  function recordClick(element, source) {
    const now = Date.now();
    if (pendingSkip || now - lastClickAt < CLICK_COOLDOWN_MS) {
      return false;
    }

    lastClickAt = now;
    pendingSkip = true;
    showDebugOverlay(element, 'SkipMe...');
    activateSkipButton(element)
      .then(() => {
        console.log(`[SkipMe] ${source} trusted mouse click sent; waiting for YouTube to dismiss it`);
        skipCount++;
        chrome.storage.local.set({ skipCount });
        resultVisibleUntil = Date.now() + 1200;
        showDebugOverlay(element, 'SkipMe: Skipped');
        window.setTimeout(hideDebugOverlay, 1200);
        pendingSkip = false;
      })
      .catch((error) => {
        pendingSkip = false;
        console.error('[SkipMe] Trusted mouse click failed:', error.message);
      });
    return true;
  }

  // Click the skip button
  function clickSkipButton() {
    if (!isEnabled) return;

    const skipButton = findSkipButton();
    if (skipButton) {
      return recordClick(skipButton, 'Skip button');
    }
    return false;
  }

  // MutationObserver to watch for skip button appearing
  const observer = new MutationObserver((mutations) => {
    // Quick check: did any new nodes get added?
    let hasNewNodes = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }

    if (hasNewNodes) {
      // Small delay to let the button fully render
      setTimeout(clickSkipButton, 100);
    }
  });

  // Start observing the document body for changes
  function startObserving() {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden']
      });
    } else {
      // If body isn't ready yet, wait for it
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden']
        });
      });
    }
  }

  // Also run on interval as a fallback (YouTube uses a lot of dynamic loading)
  setInterval(() => {
    clickSkipButton();
  }, 1000);

  // Handle YouTube's SPA navigation (no page reload)
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      // Reset and try to skip any ads on the new page
      setTimeout(clickSkipButton, 500);
    }
  });

  // Observe URL changes
  const titleElement = document.querySelector('title');
  if (titleElement) {
    urlObserver.observe(titleElement, { childList: true });
  }

  // Also listen for YouTube's navigation events
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(clickSkipButton, 500);
  });

  // Start the observer
  startObserving();

  // Initial check
  setTimeout(clickSkipButton, 1000);

  console.log('[SkipMe] Extension loaded and active!');
})();
