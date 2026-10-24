chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'clickSkipButton' || !sender.tab?.id) {
    return false;
  }

  const target = { tabId: sender.tab.id };
  const coordinates = {
    x: Number(message.x),
    y: Number(message.y)
  };

  if (!Number.isFinite(coordinates.x) || !Number.isFinite(coordinates.y)) {
    sendResponse({ success: false, error: 'Invalid button coordinates' });
    return false;
  }

  chrome.debugger.attach(target, '1.3', () => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }

    chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...coordinates
    }, () => {
      chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...coordinates,
        button: 'left',
        clickCount: 1
      }, () => {
        chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          ...coordinates,
          button: 'left',
          clickCount: 1
        }, () => {
          const commandError = chrome.runtime.lastError?.message;
          chrome.debugger.detach(target, () => {
            sendResponse(commandError
              ? { success: false, error: commandError }
              : { success: true });
          });
        });
      });
    });
  });

  return true;
});
