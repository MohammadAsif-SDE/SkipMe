// SkipMe popup script
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('enableToggle');
  const skipCountEl = document.getElementById('skipCount');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Load saved state
  chrome.storage.local.get(['enabled', 'skipCount'], (result) => {
    toggle.checked = result.enabled !== false;
    updateUI(toggle.checked, result.skipCount || 0);
  });

  // Toggle handler
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ enabled });
    
    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggle',
          enabled: enabled
        });
      }
    });

    updateUI(enabled);
  });

  function updateUI(enabled, count) {
    if (enabled) {
      statusDot.classList.remove('disabled');
      statusText.textContent = 'Active - Watching for ads...';
    } else {
      statusDot.classList.add('disabled');
      statusText.textContent = 'Disabled - Ads will play normally';
    }
    
    if (count !== undefined) {
      skipCountEl.textContent = count;
    }
  }
});
