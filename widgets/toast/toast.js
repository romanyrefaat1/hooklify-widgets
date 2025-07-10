(function () {
  // Supabase configuration
  const SUPABASE_URL = 'https://uyzmxzjdnnerroiojmao.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5em14empkbm5lcnJvaW9qbWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3MTkwOTgsImV4cCI6MjA2NzI5NTA5OH0.DYy8Vos2p2A9ollMdGGJCsumYWiqb15hIZFyAy-Hbiw';

  // Get widgetId and siteId from script attributes
  const widgetId = document.currentScript.getAttribute('data-widget-id');
  const siteId = document.currentScript.getAttribute('data-site-id');

  // Log initial script start
  console.log('[SocialProof] Script starting with widgetId:', widgetId, 'siteId:', siteId);

  // Validate required parameters
  if (!widgetId || !siteId) {
    console.error('[SocialProof] Both widgetId and siteId are required. Please provide data-widget-id and data-site-id attributes.');
    return;
  }

  // Configuration constants
  const CONFIG = {
    CACHE_DURATION: 2 * 24 * 60 * 60 * 1000, // 2 days in milliseconds
    FALLBACK_EVENT_COUNT: 15,
    BURST_INTERVAL: 3 * 60 * 1000, // 3 minutes
    BURST_VARIANCE: 2 * 60 * 1000, // +/- 2 minutes
  };

  // State management variables
  let supabaseClient = null;
  let eventDisplayTimer = null;
  let burstModeTimer = null;
  let currentSiteId = siteId;
  let currentWidgetId = widgetId;
  let currentWidgetConfig = null;
  let fallbackEvents = [];
  let lastShownEventIndex = -1;
  let isBurstMode = false;
  let burstEventCount = 0;
  let liveEventQueue = [];

  // Toast stacking management
  let activeToasts = [];

  /**
   * Calculates the time elapsed since a given date.
   * @param {string} date - The date string to compare against.
   * @returns {string} A human-readable string indicating time ago (e.g., "5 minutes ago").
   */
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
      right: 20px;
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

    .sps-toast.show {
      opacity: 1;
      transform: translateX(0) translateY(0) scale(1);
      animation: toastBounce 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

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

    .sps-toast:hover {
      transform: translateX(0) translateY(0) scale(1.05);
      box-shadow:
        0 6px 25px rgba(0,0,0,0.2),
        0 4px 15px rgba(0,0,0,0.15),
        0 0 0 1px rgba(255,255,255,0.1);
      transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .sps-toast {
      transition:
        opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        top 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        bottom 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        right 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

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

    .sps-toast .rich-text:hover {
      transform: scale(1.05);
      transition: transform 0.2s ease;
    }

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

  /**
   * Updates the positions of active toasts smoothly using requestAnimationFrame.
   */
  function updateToastPositionsSmooth() {
    const customStyles = currentWidgetConfig?.styles?.["info"] || {};
    const hasTop = customStyles.top !== undefined;
    const hasBottom = customStyles.bottom !== undefined;
    const hasLeft = customStyles.left !== undefined;
    const hasRight = customStyles.right !== undefined;

    let offset = 20;

    requestAnimationFrame(() => {
      if (hasTop && !hasBottom) {
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

      if (hasLeft && !hasRight) {
        activeToasts.forEach(toast => {
          toast.style.left = customStyles.left;
          toast.style.right = 'auto';
        });
      } else if (hasRight && !hasLeft) {
        activeToasts.forEach(toast => {
          toast.style.right = customStyles.right;
          toast.style.left = 'auto';
        });
      }
    });
  }

  /**
   * Wrapper for updating toast positions.
   */
  function updateToastPositions() {
    updateToastPositionsSmooth();
  }

  /**
   * Applies custom CSS styles to a toast element based on widget configuration.
   * @param {HTMLElement} toast - The toast element to style.
   * @param {Object} customStyles - An object containing CSS properties and values.
   */
  function applyCustomStyles(toast, customStyles) {
    console.log("CUSTOM STYLES", customStyles);
    if (!customStyles) return;

    Object.keys(customStyles).forEach(key => {
      const cssProperty = key.replace(/([A-Z])/g, '-$1').toLowerCase();

      if (['background', 'color', 'border-radius', 'padding', 'margin'].includes(cssProperty)) {
        toast.style.transition = toast.style.transition + `, ${cssProperty} 0.3s ease`;
      }

      toast.style.setProperty(cssProperty, customStyles[key]);
    });
  }

  /**
   * Renders rich text messages into an array of span elements.
   * @param {Array|string} message - The message, either an array of segments or a plain string.
   * @returns {Array<HTMLElement>} An array of span elements representing the message.
   */
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

  /**
   * Displays a social proof toast notification on the page.
   * @param {Array|string} message - The message content for the toast.
   * @param {string} timestamp - The ISO string timestamp of the event.
   * @param {string} event_type - The type of event for custom styling.
   */
  function showToast(message, timestamp, event_type) {
    console.log('[SocialProof] Showing toast:', message);

    const toast = document.createElement('div');
    toast.className = 'sps-toast';

    const href = currentWidgetConfig?.href;
    let containerElement = toast;

    if (href) {
      const aTag = document.createElement("a");
      aTag.href = href;
      aTag.style.textDecoration = 'none';
      aTag.style.color = 'inherit';
      aTag.appendChild(toast);
      containerElement = aTag;
    }

    const defaultStyle = currentWidgetConfig?.styles?.[event_type] || currentWidgetConfig?.default_style || 'default';
    const customStyles = currentWidgetConfig?.styles?.[defaultStyle] || {};

    console.log("XLM: DEFAULT STYLE", defaultStyle);
    console.log("XLM: CUSTOM STYLES", customStyles);

    const hasLeft = customStyles.left !== undefined;
    const hasRight = customStyles.right !== undefined;
    const hasTop = customStyles.top !== undefined;
    const hasBottom = customStyles.bottom !== undefined;

    if (hasLeft && !hasRight) {
      toast.classList.add('from-left');
    } else if (hasRight && !hasLeft) {
      toast.classList.add('from-right');
    } else if (hasTop && !hasBottom) {
      toast.classList.add('from-top');
    } else if (hasBottom && !hasTop) {
      toast.classList.add('from-bottom');
    } else {
      toast.classList.add('from-right');
    }

    if (currentWidgetConfig && currentWidgetConfig.styles) {
      applyCustomStyles(toast, customStyles);
    }

    const textElements = renderRichText(message);
    textElements.forEach(element => {
      toast.appendChild(element);
    });

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
    timeAgoEl.style.color = customStyles?.color || 'rgba(255, 255, 255, 0.8)';

    const intervalId = setInterval(() => {
      timeAgoEl.textContent = timeAgo(timestamp);
    }, 5000);

    const poweredBy = document.createElement('span');
    poweredBy.innerHTML = 'Powered by <a href="https://hooklify.vercel.app" target="_blank" rel="noopener noreferrer" style="color:rgb(38, 100, 40); text-decoration: none; font-weight: 700; font-size: 12px">Hooklify</a>';

    footer.appendChild(timeAgoEl);
    footer.appendChild(poweredBy);
    toast.appendChild(footer);

    document.body.appendChild(containerElement);
    activeToasts.push(toast);
    updateToastPositions();

    toast.offsetHeight;

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

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

        updateToastPositionsSmooth();
      }, 400);
    }, 5000);

    toast._hideTimeout = hideTimeout;
  }

  /**
   * Generates a cache key based on the current site and widget IDs.
   * @returns {string} The cache key.
   */
  function getCacheKey() {
    return `social_proof_events_${currentSiteId}_${currentWidgetId}`;
  }

  /**
   * Saves events and widget config to local storage cache.
   * @param {Array} events - The array of events to cache.
   * @param {Object} widgetConfig - The widget configuration.
   */
  function saveEventsToCache(events, widgetConfig) {
    const cacheData = {
      events,
      timestamp: Date.now(),
      siteId: currentSiteId,
      widgetId: currentWidgetId,
      widgetConfig,
      lastShownIndex: -1
    };

    try {
      localStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
      console.log('[SocialProof] Events cached successfully');
    } catch (error) {
      console.error('[SocialProof] Failed to cache events:', error);
    }
  }

  /**
   * Loads events and widget config from local storage cache.
   * @returns {Object|null} The cached data or null if not found or expired.
   */
  function loadEventsFromCache() {
    try {
      const cached = localStorage.getItem(getCacheKey());
      if (!cached) {
        console.log('[SocialProof] No cached events found');
        return null;
      }

      const cacheData = JSON.parse(cached);
      const now = Date.now();

      if (now - cacheData.timestamp > CONFIG.CACHE_DURATION) {
        console.log('[SocialProof] Cache expired, will fetch fresh events');
        localStorage.removeItem(getCacheKey());
        return null;
      }

      console.log('[SocialProof] Loaded events from cache:', cacheData.events.length);
      return cacheData;
    } catch (error) {
      console.error('[SocialProof] Failed to load cached events:', error);
      return null;
    }
  }

  /**
   * Gets a random delay for displaying the next event in normal mode.
   * @returns {number} Delay in seconds.
   */
  function getRandomDelay() {
    const isShortDelay = Math.random() < 0.5;
    if (isShortDelay) {
      return Math.random() * 4.5 + 0.5; // 0.5-5 seconds
    } else {
      return Math.random() * 10 + 5; // 5-15 seconds
    }
  }

  /**
   * Gets a random, shorter delay for displaying the next event in burst mode.
   * @returns {number} Delay in seconds.
   */
  function getBurstDelay() {
    return Math.random() * 3 + 2; // 2-5 seconds
  }

  /**
   * Retrieves a random fallback event from the fallbackEvents array.
   * @returns {Object|null} A random event object or null if no events are available.
   */
  function getRandomFallbackEvent() {
    console.log('[SocialProof] Getting random fallback event. Available events:', fallbackEvents.length);

    if (fallbackEvents.length === 0) {
      console.log('[SocialProof] No fallback events available');
      return null;
    }

    let eventIndex;
    do {
      eventIndex = Math.floor(Math.random() * fallbackEvents.length);
    } while (eventIndex === lastShownEventIndex && fallbackEvents.length > 1);

    lastShownEventIndex = eventIndex;
    const event = fallbackEvents[eventIndex];
    console.log('[SocialProof] Selected event:', event);
    return event;
  }

  /**
   * Formats an event object into a display message.
   * @param {Object} event - The event object containing event_data and event_type.
   * @returns {Array|string} The formatted message.
   */
  function formatEventMessage(event) {
    if (event.event_data && event.event_data.message) {
      return event.event_data.message;
    }

    const name = event.event_data?.name || 'Someone';
    return `${name} just did: ${event.event_type}`;
  }

  /**
   * Displays the next event, prioritizing events from the live queue.
   */
  function displayNextEvent() {
    let eventToShow = null;

    if (liveEventQueue.length > 0) {
      eventToShow = liveEventQueue.shift();
      console.log('[SocialProof] Displaying live event:', eventToShow);
    } else {
      eventToShow = getRandomFallbackEvent();
      if (eventToShow) {
        console.log('[SocialProof] Displaying fallback event:', eventToShow);
      } else {
        console.log('[SocialProof] No events available to display');
        console.log('[SocialProof] Debug info - currentSiteId:', currentSiteId, 'fallbackEvents.length:', fallbackEvents.length);
      }
    }

    if (eventToShow) {
      const message = formatEventMessage(eventToShow);
      const timestamp = eventToShow.timestamp;
      showToast(message, timestamp, eventToShow.event_type);
    }

    scheduleNextEvent();
  }

  /**
   * Schedules the next event to be displayed after a calculated delay.
   */
  function scheduleNextEvent() {
    if (eventDisplayTimer) {
      clearTimeout(eventDisplayTimer);
    }

    let delay;

    if (isBurstMode) {
      delay = getBurstDelay() * 1000;
      burstEventCount++;

      if (burstEventCount >= 2) {
        isBurstMode = false;
        burstEventCount = 0;
        console.log('[SocialProof] Burst mode complete, switching to normal mode');
      }
    } else {
      delay = getRandomDelay() * 1000;
    }

    console.log(`[SocialProof] Next event in ${delay/1000}s (${isBurstMode ? 'burst' : 'normal'} mode)`);

    eventDisplayTimer = setTimeout(() => {
      displayNextEvent();
    }, delay);
  }

  /**
   * Initiates burst mode for rapid event display.
   */
  function startBurstMode() {
    console.log('[SocialProof] Starting burst mode');
    isBurstMode = true;
    burstEventCount = 0;
    displayNextEvent();
  }

  /**
   * Fetches widget configuration from Supabase.
   * @returns {Promise<Object|null>} The widget configuration or null if not found.
   */
  async function fetchWidgetConfig() {
    try {
      console.log('[SocialProof] Fetching widget config for widgetId:', currentWidgetId);
      
      const { data, error } = await supabaseClient
        .from('widgets')
        .select('*')
        .eq('id', currentWidgetId)
        .eq('site_id', currentSiteId)
        .single();

      if (error) {
        console.error('[SocialProof] Error fetching widget config:', error);
        return null;
      }

      console.log('[SocialProof] Widget config fetched:', data);
      return data;
    } catch (error) {
      console.error('[SocialProof] Failed to fetch widget config:', error);
      return null;
    }
  }

  /**
   * Fetches fallback events from Supabase.
   * @returns {Promise<Array>} Array of events or empty array if none found.
   */
  async function fetchFallbackEvents() {
    try {
      console.log('[SocialProof] Fetching fallback events for siteId:', currentSiteId);
      
      const { data, error } = await supabaseClient
        .from('events')
        .select('*')
        .eq('site_id', currentSiteId)
        .order('created_at', { ascending: false })
        .limit(CONFIG.FALLBACK_EVENT_COUNT);

      if (error) {
        console.error('[SocialProof] Error fetching fallback events:', error);
        return [];
      }

      console.log('[SocialProof] Fallback events fetched:', data.length);
      return data || [];
    } catch (error) {
      console.error('[SocialProof] Failed to fetch fallback events:', error);
      return [];
    }
  }

  /**
   * Initializes the widget by fetching configuration and fallback events.
   * @returns {Promise<boolean>} True if initialization was successful.
   */
  async function initializeWidget() {
    try {
      console.log('[SocialProof] Initializing widget...');

      // Fetch widget configuration
      const widgetConfig = await fetchWidgetConfig();
      if (!widgetConfig) {
        console.error('[SocialProof] Failed to fetch widget configuration');
        return false;
      }

      // Fetch fallback events
      const events = await fetchFallbackEvents();

      // Update global state
      currentWidgetConfig = widgetConfig;
      fallbackEvents = events;

      // Save to cache
      saveEventsToCache(fallbackEvents, currentWidgetConfig);

      console.log('[SocialProof] Widget initialized successfully');
      return true;
    } catch (error) {
      console.error('[SocialProof] Failed to initialize widget:', error);
      return false;
    }
  }

  /**
   * Handles incoming live event payloads from the Supabase broadcast channel.
   * @param {Object} payload - The live event data received.
   */
  function handleLiveEvent(payload) {
    console.log('[SocialProof] Received live event:', payload);
    const message = payload.message || 'A new event occurred!';
    const timestamp = payload.timestamp || new Date().toISOString();

    if (isBurstMode) {
      liveEventQueue.push({ message, timestamp, event_type: payload.event_type || 'info' });
    } else {
      showToast(message, timestamp, payload.event_type || 'info');
    }
  }

  /**
   * Starts the periodic display of social proof events.
   */
  function startEventDisplay() {
    console.log('[SocialProof] Starting event display system');
    console.log('[SocialProof] Current state - fallbackEvents:', fallbackEvents.length, 'currentSiteId:', currentSiteId, 'currentWidgetId:', currentWidgetId);
    startBurstMode();
  }

  /**
   * Cleans up timers and removes active toasts.
   */
  function cleanup() {
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

  // --- Main Initialization Flow ---

  // Dynamically load the Supabase client library
  const scriptTag = document.createElement('script');
  scriptTag.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  scriptTag.onload = async () => {
    console.log('[SocialProof] Supabase script loaded');

    try {
      // Initialize Supabase client
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('[SocialProof] Supabase client created');

      // Attempt to load from cache first
      const cachedData = loadEventsFromCache();

      if (cachedData && cachedData.events.length > 0 && cachedData.siteId && cachedData.widgetId && cachedData.widgetConfig) {
        // Use cached data
        fallbackEvents = cachedData.events;
        currentWidgetConfig = cachedData.widgetConfig;
        lastShownEventIndex = cachedData.lastShownIndex;
        console.log('[SocialProof] Using cached events and config:', fallbackEvents.length);
      } else {
        // Fetch fresh data from Supabase
        console.log('[SocialProof] No valid cache, fetching fresh data...');
        const initSuccess = await initializeWidget();
        if (!initSuccess) {
          console.error('[SocialProof] Widget initialization failed. Aborting script.');
          return;
        }
      }

      // Set up broadcast subscription
      console.log(`[SocialProof] Setting up broadcast subscription for widget ID: ${currentWidgetId}...`);
      const channel = supabaseClient
        .channel('social-proof-events')
        .on(
          'broadcast',
          { event: `social-proof-event-${currentWidgetId}` },
          handleLiveEvent
        )
        .subscribe((status) => {
          console.log('[SocialProof] Subscription status:', status);
          switch (status) {
            case 'SUBSCRIBED':
              console.log('[SocialProof] Successfully subscribed to broadcast events');
              break;
            case 'CHANNEL_ERROR':
              console.error('[SocialProof] Error subscribing to channel');
              break;
            case 'TIMED_OUT':
              console.error('[SocialProof] Subscription timed out');
              break;
            case 'CLOSED':
              console.log('[
