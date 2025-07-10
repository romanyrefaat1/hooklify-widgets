(function () {
  // Configuration - can be set via script attributes or defaults
  const CONFIG = {
    CACHE_DURATION: 2 * 24 * 60 * 60 * 1000, // 2 days in milliseconds
    FALLBACK_EVENT_COUNT: 15,
    BURST_INTERVAL: 3 * 60 * 1000, // 3 minutes
    BURST_VARIANCE: 2 * 60 * 1000, // +/- 2 minutes
    DISPLAY_INTERVAL: 5000, // 5 seconds between toasts
    TOAST_DURATION: 5000 // 5 seconds display time
  };

  // Get configuration from script attributes
  const scriptElement = document.currentScript;
  const widgetConfig = {
    href: scriptElement.getAttribute('href') || null,
    position: scriptElement.getAttribute('position') || 'bottom-right',
    theme: scriptElement.getAttribute('theme') || 'dark',
    messages: scriptElement.getAttribute('messages') ? JSON.parse(scriptElement.getAttribute('messages')) : null,
    customStyles: scriptElement.getAttribute('custom-styles') ? JSON.parse(scriptElement.getAttribute('custom-styles')) : null,
    eventTypes: scriptElement.getAttribute('event-types') ? scriptElement.getAttribute('event-types').split(',') : ['purchase', 'signup', 'download']
  };

  console.log('[SocialProof] Widget config:', widgetConfig);

  // State management
  let eventDisplayTimer = null;
  let burstModeTimer = null;
  let fallbackEvents = [];
  let lastShownEventIndex = -1;
  let isBurstMode = false;
  let burstEventCount = 0;
  let liveEventQueue = [];
  let isActive = true;

  // Toast stacking management
  let activeToasts = [];

  // Default fallback events - can be customized via script attributes
  const DEFAULT_EVENTS = [
    {
      id: 1,
      event_type: 'purchase',
      event_data: {
        name: 'Sarah',
        message: [{value: 'Sarah', style: 'bold', color: '#4CAF50'}, {value: ' just purchased ', style: 'normal'}, {value: 'Pro Plan', style: 'bold'}]
      },
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    {
      id: 2,
      event_type: 'signup',
      event_data: {
        name: 'Mike',
        message: [{value: 'Mike', style: 'bold', color: '#2196F3'}, {value: ' just signed up for ', style: 'normal'}, {value: 'the newsletter', style: 'bold'}]
      },
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    {
      id: 3,
      event_type: 'download',
      event_data: {
        name: 'Jennifer',
        message: [{value: 'Jennifer', style: 'bold', color: '#FF9800'}, {value: ' just downloaded ', style: 'normal'}, {value: 'the free guide', style: 'bold'}]
      },
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    {
      id: 4,
      event_type: 'purchase',
      event_data: {
        name: 'David',
        message: [{value: 'David', style: 'bold', color: '#4CAF50'}, {value: ' just bought ', style: 'normal'}, {value: 'Premium Course', style: 'bold'}]
      },
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    {
      id: 5,
      event_type: 'signup',
      event_data: {
        name: 'Emma',
        message: [{value: 'Emma', style: 'bold', color: '#2196F3'}, {value: ' just joined ', style: 'normal'}, {value: 'the community', style: 'bold'}]
      },
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    {
      id: 6,
      event_type: 'purchase',
      event_data: {
        name: 'Alex',
        message: [{value: 'Alex', style: 'bold', color: '#4CAF50'}, {value: ' just purchased ', style: 'normal'}, {value: 'Starter Pack', style: 'bold'}]
      },
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    {
      id: 7,
      event_type: 'download',
      event_data: {
        name: 'Rachel',
        message: [{value: 'Rachel', style: 'bold', color: '#FF9800'}, {value: ' just downloaded ', style: 'normal'}, {value: 'the template', style: 'bold'}]
      },
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
    },
    {
      id: 8,
      event_type: 'signup',
      event_data: {
        name: 'Tom',
        message: [{value: 'Tom', style: 'bold', color: '#2196F3'}, {value: ' just subscribed to ', style: 'normal'}, {value: 'updates', style: 'bold'}]
      },
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
    }
  ];

  function timeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - new Date(date)) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";

    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";

    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";

    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";

    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";

    if (seconds < 10) return "just now";

    return Math.floor(seconds) + " seconds ago";
  }

  // Enhanced toast styles with smooth animations
  const toastStyles = document.createElement('style');
  toastStyles.innerHTML = `
    .sps-toast {
      position: fixed;
      background: #000;
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      font-family: sans-serif;
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      max-width: 300px;
      margin-bottom: 10px;
      transform: scale(0.9);
      backdrop-filter: blur(9px);
      box-shadow: 
        0 4px 20px rgba(0,0,0,0.15),
        0 2px 10px rgba(0,0,0,0.1),
        0 0 0 1px rgba(255,255,255,0.05);
      will-change: transform, opacity;
    }

    /* Position-based classes */
    .sps-toast.bottom-right {
      bottom: 20px;
      right: 20px;
    }
    .sps-toast.bottom-left {
      bottom: 20px;
      left: 20px;
    }
    .sps-toast.top-right {
      top: 20px;
      right: 20px;
    }
    .sps-toast.top-left {
      top: 20px;
      left: 20px;
    }

    /* Theme classes */
    .sps-toast.dark {
      background: #000;
      color: #fff;
    }
    .sps-toast.light {
      background: #fff;
      color: #000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    .sps-toast.blue {
      background: #1976D2;
      color: #fff;
    }
    .sps-toast.green {
      background: #388E3C;
      color: #fff;
    }
    
    /* Entrance animations */
    .sps-toast.from-right {
      transform: translateX(100%) scale(0.9);
    }
    .sps-toast.from-left {
      transform: translateX(-100%) scale(0.9);
    }
    .sps-toast.from-top {
      transform: translateY(-100%) scale(0.9);
    }
    .sps-toast.from-bottom {
      transform: translateY(100%) scale(0.9);
    }
    
    /* Show state */
    .sps-toast.show {
      opacity: 1;
      transform: translateX(0) translateY(0) scale(1);
      animation: toastBounce 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    
    /* Exit animations */
    .sps-toast.hide.from-right {
      opacity: 0;
      transform: translateX(100%) scale(0.8);
      transition: all 0.4s cubic-bezier(0.55, 0.055, 0.675, 0.19);
    }
    .sps-toast.hide.from-left {
      opacity: 0;
      transform: translateX(-100%) scale(0.8);
      transition: all 0.4s cubic-bezier(0.55, 0.055, 0.675, 0.19);
    }
    .sps-toast.hide.from-top {
      opacity: 0;
      transform: translateY(-100%) scale(0.8);
      transition: all 0.4s cubic-bezier(0.55, 0.055, 0.675, 0.19);
    }
    .sps-toast.hide.from-bottom {
      opacity: 0;
      transform: translateY(100%) scale(0.8);
      transition: all 0.4s cubic-bezier(0.55, 0.055, 0.675, 0.19);
    }
    
    /* Bounce animation */
    @keyframes toastBounce {
      0% {
        transform: translateX(0) translateY(0) scale(0.9);
        opacity: 0;
      }
      50% {
        transform: translateX(0) translateY(0) scale(1.01);
        opacity: 0.8;
      }
      100% {
        transform: translateX(0) translateY(0) scale(1);
        opacity: 1;
      }
    }
    
    /* Hover effect */
    .sps-toast:hover {
      transform: translateX(0) translateY(0) scale(1.05);
      box-shadow: 
        0 6px 25px rgba(0,0,0,0.2),
        0 4px 15px rgba(0,0,0,0.15),
        0 0 0 1px rgba(255,255,255,0.1);
      transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    
    /* Smooth positioning transitions */
    .sps-toast {
      transition: 
        opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        top 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        bottom 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        right 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    
    /* Rich text styling */
    .sps-toast .rich-text {
      display: inline;
      transition: all 0.3s ease;
    }
    .sps-toast .rich-text.bold {
      font-weight: bold;
    }
    .sps-toast .rich-text.italic {
      font-style: italic;
    }
    .sps-toast .rich-text.underline {
      text-decoration: underline;
    }
    
    /* Stacked toasts */
    .sps-toast.stacked {
      animation: stackedFadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    
    @keyframes stackedFadeIn {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    /* Accessibility */
    @media (prefers-reduced-motion: reduce) {
      .sps-toast {
        animation: none;
        transition: opacity 0.3s ease;
      }
      .sps-toast.show {
        animation: none;
      }
    }
  `;
  document.head.appendChild(toastStyles);

  // Utility functions
  function updateToastPositions() {
    const position = widgetConfig.position;
    let offset = 20;
    
    requestAnimationFrame(() => {
      if (position.includes('top')) {
        activeToasts.forEach((toast, index) => {
          toast.style.top = offset + 'px';
          toast.style.bottom = 'auto';
          offset += toast.offsetHeight + 10;
          
          if (index > 0) {
            toast.classList.add('stacked');
          }
        });
      } else {
        activeToasts.forEach((toast, index) => {
          toast.style.bottom = offset + 'px';
          toast.style.top = 'auto';
          offset += toast.offsetHeight + 10;
          
          if (index > 0) {
            toast.classList.add('stacked');
          }
        });
      }
    });
  }

  function applyCustomStyles(toast, customStyles) {
    if (!customStyles) return;
    
    Object.keys(customStyles).forEach(key => {
      const cssProperty = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      
      if (['background', 'color', 'border-radius', 'padding', 'margin'].includes(cssProperty)) {
        toast.style.transition = toast.style.transition + `, ${cssProperty} 0.3s ease`;
      }
      
      toast.style.setProperty(cssProperty, customStyles[key]);
    });
  }

  function renderRichText(message) {
    if (Array.isArray(message)) {
      return message.map(segment => {
        const span = document.createElement('span');
        span.className = 'rich-text';
        span.textContent = segment.value;
        
        if (segment.style) {
          span.classList.add(segment.style);
        }
        
        if (segment.color) {
          span.style.color = segment.color;
        }
        
        return span;
      });
    } else {
      const span = document.createElement('span');
      span.textContent = message;
      return [span];
    }
  }

  function showToast(message, timestamp, event_type) {
    console.log('[SocialProof] Showing toast:', message);

    const toast = document.createElement('div');
    toast.className = `sps-toast ${widgetConfig.position} ${widgetConfig.theme}`;

    const href = widgetConfig.href;
    let containerElement = toast;

    if (href) {
      const aTag = document.createElement("a");
      aTag.href = href;
      aTag.style.textDecoration = 'none';
      aTag.style.color = 'inherit';
      aTag.appendChild(toast);
      containerElement = aTag;
    }

    // Set animation direction based on position
    if (widgetConfig.position.includes('left')) {
      toast.classList.add('from-left');
    } else if (widgetConfig.position.includes('right')) {
      toast.classList.add('from-right');
    } else if (widgetConfig.position.includes('top')) {
      toast.classList.add('from-top');
    } else {
      toast.classList.add('from-bottom');
    }

    // Apply custom styles
    if (widgetConfig.customStyles) {
      applyCustomStyles(toast, widgetConfig.customStyles);
    }

    // Render rich text or plain text
    const textElements = renderRichText(message);
    textElements.forEach(element => {
      toast.appendChild(element);
    });

    // Add footer with time ago
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 11px;
      opacity: 0.7;
    `;

    const timeAgoEl = document.createElement('span');
    timeAgoEl.textContent = timeAgo(timestamp);

    const intervalId = setInterval(() => {
      if (toast.parentNode) {
        timeAgoEl.textContent = timeAgo(timestamp);
      } else {
        clearInterval(intervalId);
      }
    }, 5000);

    footer.appendChild(timeAgoEl);
    toast.appendChild(footer);

    // Add to DOM
    document.body.appendChild(containerElement);
    activeToasts.push(toast);

    // Update positions
    updateToastPositions();

    // Force reflow
    toast.offsetHeight;

    // Show animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Hide after duration
    const hideTimeout = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');

      setTimeout(() => {
        const index = activeToasts.indexOf(toast);
        if (index > -1) {
          activeToasts.splice(index, 1);
        }

        clearInterval(intervalId);

        if (containerElement.parentNode) {
          containerElement.parentNode.removeChild(containerElement);
        }

        updateToastPositions();
      }, 400);
    }, CONFIG.TOAST_DURATION);

    toast._hideTimeout = hideTimeout;
  }

  function getRandomDelay() {
    const isShortDelay = Math.random() < 0.5;
    if (isShortDelay) {
      return Math.random() * 4.5 + 0.5; // 0.5-5 seconds
    } else {
      return Math.random() * 10 + 5; // 5-15 seconds
    }
  }

  function getBurstDelay() {
    return Math.random() * 3 + 2; // 2-5 seconds
  }

  function getRandomFallbackEvent() {
    if (fallbackEvents.length === 0) {
      return null;
    }

    let eventIndex;
    do {
      eventIndex = Math.floor(Math.random() * fallbackEvents.length);
    } while (eventIndex === lastShownEventIndex && fallbackEvents.length > 1);

    lastShownEventIndex = eventIndex;
    return fallbackEvents[eventIndex];
  }

  function formatEventMessage(event) {
    if (event.event_data && event.event_data.message) {
      return event.event_data.message;
    }

    const name = event.event_data?.name || 'Someone';
    return `${name} just did: ${event.event_type}`;
  }

  function displayNextEvent() {
    if (!isActive) return;

    let eventToShow = null;

    // Check for live events first
    if (liveEventQueue.length > 0) {
      eventToShow = liveEventQueue.shift();
      console.log('[SocialProof] Displaying live event:', eventToShow);
    } else {
      eventToShow = getRandomFallbackEvent();
      if (eventToShow) {
        console.log('[SocialProof] Displaying fallback event:', eventToShow);
      }
    }

    if (eventToShow) {
      const message = formatEventMessage(eventToShow);
      const timestamp = eventToShow.timestamp;
      showToast(message, timestamp, eventToShow.event_type);
    }

    scheduleNextEvent();
  }

  function scheduleNextEvent() {
    if (!isActive) return;

    if (eventDisplayTimer) {
      clearTimeout(eventDisplayTimer);
    }

    let delay;

    if (isBurstMode) {
      delay = getBurstDelay() * 1000;
      burstEventCount++;

      if (burstEventCount >= 3) {
        isBurstMode = false;
        burstEventCount = 0;
        console.log('[SocialProof] Burst mode complete');
      }
    } else {
      delay = getRandomDelay() * 1000;
    }

    console.log(`[SocialProof] Next event in ${delay/1000}s`);

    eventDisplayTimer = setTimeout(() => {
      displayNextEvent();
    }, delay);
  }

  function startBurstMode() {
    console.log('[SocialProof] Starting burst mode');
    isBurstMode = true;
    burstEventCount = 0;
  }

  function initializeFallbackEvents() {
    // Use custom messages if provided, otherwise use defaults
    if (widgetConfig.messages && Array.isArray(widgetConfig.messages)) {
      fallbackEvents = widgetConfig.messages.map((msg, index) => ({
        id: index + 1,
        event_type: 'custom',
        event_data: { message: msg },
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString()
      }));
    } else {
      fallbackEvents = DEFAULT_EVENTS.slice(); // Create a copy
    }

    // Filter by event types if specified
    if (widgetConfig.eventTypes && widgetConfig.eventTypes.length > 0) {
      fallbackEvents = fallbackEvents.filter(event => 
        widgetConfig.eventTypes.includes(event.event_type) || event.event_type === 'custom'
      );
    }

    console.log('[SocialProof] Initialized with', fallbackEvents.length, 'events');
  }

  function startEventDisplay() {
    console.log('[SocialProof] Starting event display system');
    
    // Start with burst mode occasionally
    if (Math.random() < 0.3) {
      startBurstMode();
    }

    // Display first event after a short delay
    setTimeout(() => {
      displayNextEvent();
    }, 2000);
  }

  function cleanup() {
    isActive = false;
    
    if (eventDisplayTimer) {
      clearTimeout(eventDisplayTimer);
    }
    if (burstModeTimer) {
      clearTimeout(burstModeTimer);
    }

    activeToasts.forEach(toast => {
      if (toast._hideTimeout) {
        clearTimeout(toast._hideTimeout);
      }

      toast.classList.add('hide');

      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 400);
    });

    activeToasts = [];
  }

  // Public API for external control
  window.SocialProofWidget = {
    // Add a live event
    addEvent: function(message, eventType = 'custom') {
      const event = {
        id: Date.now(),
        event_type: eventType,
        event_data: { message: message },
        timestamp: new Date().toISOString()
      };
      liveEventQueue.push(event);
      console.log('[SocialProof] Added live event:', event);
    },

    // Pause/resume the widget
    pause: function() {
      isActive = false;
      if (eventDisplayTimer) {
        clearTimeout(eventDisplayTimer);
      }
      console.log('[SocialProof] Paused');
    },

    resume: function() {
      if (!isActive) {
        isActive = true;
        scheduleNextEvent();
        console.log('[SocialProof] Resumed');
      }
    },

    // Update configuration
    updateConfig: function(newConfig) {
      Object.assign(widgetConfig, newConfig);
      console.log('[SocialProof] Config updated:', widgetConfig);
    },

    // Get current status
    getStatus: function() {
      return {
        isActive: isActive,
        activeToasts: activeToasts.length,
        queuedEvents: liveEventQueue.length,
        fallbackEvents: fallbackEvents.length,
        config: widgetConfig
      };
    }
  };

  // Initialize everything
  console.log('[SocialProof] Initializing widget...');
  
  initializeFallbackEvents();
  startEventDisplay();

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);

  console.log('[SocialProof] Widget initialized successfully!');
})();
