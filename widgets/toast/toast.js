(function () {
  // Supabase URL and Anon Key are kept for the broadcast channel,
  // as direct data fetching is now handled by your JWT-authenticated API routes.
  const SUPABASE_URL = 'https://uyzmxzjdnnerroiojmao.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5em14empkbm5lcnJvaW9qbWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3MTkwOTgsImV4cCI6MjA2NzI5NTA5OH0.DYy8Vos2p2A9ollMdGGJCsumYWiqb15hIZFyAy-Hbiw';

  // Get JWT token from script attributes - this is the ONLY way to initialize the script
  const jwtToken = document.currentScript.getAttribute('data-jwt-token');
  // const NEXT_PUBLIC_APP_URL = "https://hooklify-doctorspte-gmailcoms-projects.vercel.app"
  const NEXT_PUBLIC_APP_URL = "https://hooklify.vercel.app"

  // Log initial script start with redacted JWT for security
  console.log('[SocialProof] Script starting with JWT token (first 20 chars):', jwtToken ? jwtToken.substring(0, 20) + '...' : 'N/A');

  // Configuration constants
  const CONFIG = {
    CACHE_DURATION: 2 * 24 * 60 * 60 * 1000, // 2 days in milliseconds
    FALLBACK_EVENT_COUNT: 15,
    BURST_INTERVAL: 3 * 60 * 1000, // 3 minutes
    BURST_VARIANCE: 2 * 60 * 1000, // +/- 2 minutes
    TOKEN_REFRESH_INTERVAL: 4 * 60 * 1000 // 4 minutes (refresh before 5min expiry)
  };

  // State management variables
  let supabaseClient = null; // Will be initialized for broadcast channel
  let eventDisplayTimer = null;
  let burstModeTimer = null;
  let tokenRefreshTimer = null;
  let currentSiteId = null;
  let currentWidgetId = null; // Populated from JWT API response
  let currentWidgetConfig = null;
  let fallbackEvents = [];
  let lastShownEventIndex = -1;
  let isBurstMode = false;
  let burstEventCount = 0;
  let liveEventQueue = [];
  let currentJWTToken = jwtToken; // The JWT token received from the script attribute

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

  // Enhanced toast styles with smooth animations (from initial code)
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
      /* Enhanced transition with custom easing */
      transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      max-width: 300px;
      margin-bottom: 10px;
      /* Initial scale for smoother entrance */
      transform: scale(0.9);
      /* Add subtle backdrop blur effect */
      backdrop-filter: blur(9px);
      /* Enhanced shadow for depth */
      box-shadow:
        0 4px 20px rgba(0,0,0,0.15),
        0 2px 10px rgba(0,0,0,0.1),
        0 0 0 1px rgba(255,255,255,0.05);
      /* Performance optimization */
      will-change: transform, opacity;
    }

    /* Entrance animations with scale and smooth easing */
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

    /* Show state with perfect scale and positioning */
    .sps-toast.show {
      opacity: 1;
      transform: translateX(0) translateY(0) scale(1);
      /* Add a subtle bounce effect */
      animation: toastBounce 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    /* Enhanced exit animations with scale down */
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

    /* Subtle bounce keyframe animation */
    @keyframes toastBounce {
      0% {
        transform: translateX(0) translateY(0) scale(0.9);
        opacity: 0; /* Changed from 20 to 0 for proper fade-in */
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

    /* Smooth hover effect for interactive feel */
    .sps-toast:hover {
      transform: translateX(0) translateY(0) scale(1.05);
      box-shadow:
        0 6px 25px rgba(0,0,0,0.2),
        0 4px 15px rgba(0,0,0,0.15),
        0 0 0 1px rgba(255,255,255,0.1);
      transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    /* Smooth positioning transitions for stacking */
    .sps-toast {
      transition:
        opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        top 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        bottom 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        right 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    /* Rich text styling with smooth transitions */
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

    /* Micro-animations for text elements */
    .sps-toast .rich-text:hover {
      transform: scale(1.05);
      transition: transform 0.2s ease;
    }

    /* Smooth fade-in for stacked toasts */
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

    /* Accessibility: Respect reduced motion preferences */
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
    // Determine custom styles from widget config, defaulting to 'info' if not specified
    const customStyles = currentWidgetConfig?.styles?.["info"] || {};
    const hasTop = customStyles.top !== undefined;
    const hasBottom = customStyles.bottom !== undefined;
    const hasLeft = customStyles.left !== undefined;
    const hasRight = customStyles.right !== undefined;

    let offset = 20; // Initial offset from edge

    // Use requestAnimationFrame for smoother DOM updates
    requestAnimationFrame(() => {
      // Determine stacking direction (top-down or bottom-up)
      if (hasTop && !hasBottom) {
        activeToasts.forEach((toast, index) => {
          toast.style.top = offset + 'px';
          toast.style.bottom = 'auto'; // Ensure bottom is not set if top is used
          offset += toast.offsetHeight + 10; // Add toast height and gap
          if (index > 0) {
            toast.classList.add('stacked'); // Add class for stacked animations
          }
        });
      } else {
        // Default: stack upward from bottom
        activeToasts.forEach((toast, index) => {
          toast.style.bottom = offset + 'px';
          toast.style.top = 'auto'; // Ensure top is not set if bottom is used
          offset += toast.offsetHeight + 10;
          if (index > 0) {
            toast.classList.add('stacked');
          }
        });
      }

      // Preserve horizontal positioning with smooth transitions
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

    // Iterate over custom styles and apply them to the toast element
    Object.keys(customStyles).forEach(key => {
      // Convert camelCase to kebab-case for CSS properties
      const cssProperty = key.replace(/([A-Z])/g, '-$1').toLowerCase();

      // Add smooth transitions for certain properties for a better visual effect
      if (['background', 'color', 'border-radius', 'padding', 'margin'].includes(cssProperty)) {
        toast.style.transition = toast.style.transition + `, ${cssProperty} 0.3s ease`;
      }

      toast.style.setProperty(cssProperty, customStyles[key]);
    });
  }

  /**
   * Renders rich text messages into an array of span elements.
   * This allows for bold, italic, underline, and colored text segments.
   * @param {Array|string} message - The message, either an array of segments (for rich text) or a plain string (fallback).
   * @returns {Array<HTMLElement>} An array of span elements representing the message.
   */
  function renderRichText(message) {
    // Check if the message is an array (indicating rich text format)
    if (Array.isArray(message)) {
      return message.map(segment => {
        const span = document.createElement('span');
        span.className = 'rich-text'; // Base class for rich text segments
        span.textContent = segment.value;

        // Apply style classes (e.g., 'bold', 'italic', 'underline')
        if (segment.style) {
          span.classList.add(segment.style);
        }

        // Apply custom color if specified
        if (segment.color) {
          span.style.color = segment.color;
        }

        return span;
      });
    } else {
      // Fallback for plain string messages
      const span = document.createElement('span');
      span.textContent = message;
      return [span];
    }
  }

  /**
   * Displays a social proof toast notification on the page.
   * @param {Array|string} message - The message content for the toast (can be rich text or plain string).
   * @param {string} timestamp - The ISO string timestamp of the event, used for "time ago" display.
   * @param {string} event_type - The type of event (e.g., 'purchase', 'signup'), used for custom styling.
   */
  function showToast(message, timestamp, event_type) {
    console.log('[SocialProof] Showing toast:', message);

    const toast = document.createElement('div');
    toast.className = 'sps-toast'; // Base class for the toast element

    const href = currentWidgetConfig?.href;
    let containerElement = toast; // Default container is the toast itself

    // If a link (href) is configured, wrap the toast in an anchor tag
    if (href) {
      const aTag = document.createElement("a");
      aTag.href = href;
      aTag.style.textDecoration = 'none'; // Remove default link styling
      aTag.style.color = 'inherit'; // Inherit color from toast
      aTag.appendChild(toast);
      containerElement = aTag; // The link becomes the main container element
    }

    // Determine the default style for the toast based on event type or widget config
    const defaultStyle = currentWidgetConfig?.styles?.[event_type] || currentWidgetConfig?.default_style || 'default';
    const customStyles = currentWidgetConfig?.styles?.[defaultStyle] || {};

    console.log("XLM: DEFAULT STYLE", defaultStyle);
    console.log("XLM: CUSTOM STYLES", customStyles);

    // Determine animation direction based on configured positioning
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
      // Default entry animation if no specific position is set
      toast.classList.add('from-right');
    }

    // Apply any custom styles defined in the widget configuration
    if (currentWidgetConfig && currentWidgetConfig.styles) {
      applyCustomStyles(toast, customStyles);
    }

    // Render the message, supporting rich text
    const textElements = renderRichText(message);
    textElements.forEach(element => {
      toast.appendChild(element);
    });

    // Create and append the footer with time ago and "Powered by Hooklify"
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

    // Time ago element
    const timeAgoEl = document.createElement('span');
    timeAgoEl.textContent = timeAgo(timestamp);
    timeAgoEl.style.color = customStyles?.color || 'rgba(255, 255, 255, 0.8)'; // Use configured color or default

    // Update "time ago" every 5 seconds for live accuracy
    const intervalId = setInterval(() => {
      timeAgoEl.textContent = timeAgo(timestamp);
    }, 5000);

    // "Powered by Hooklify" element
    const poweredBy = document.createElement('span');
    poweredBy.innerHTML = 'Powered by <a href="https://hooklify.vercel.app" target="_blank" rel="noopener noreferrer" style="color:rgb(38, 100, 40); text-decoration: none; font-weight: 700; font-size: 12px">Hooklify</a>';

    footer.appendChild(timeAgoEl);
    footer.appendChild(poweredBy);
    toast.appendChild(footer);

    // Add the toast (or its container link) to the DOM
    document.body.appendChild(containerElement);

    // Add to the list of active toasts for stacking management
    activeToasts.push(toast);

    // Update positions of all active toasts
    updateToastPositions();

    // Force reflow to ensure initial CSS state is applied before animation
    toast.offsetHeight;

    // Show the toast with a smooth animation using requestAnimationFrame
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Schedule the toast to hide after a duration
    const hideTimeout = setTimeout(() => {
      toast.classList.remove('show'); // Start exit animation
      toast.classList.add('hide');

      // Wait for the exit animation to complete before removing from DOM
      setTimeout(() => {
        const index = activeToasts.indexOf(toast);
        if (index > -1) {
          activeToasts.splice(index, 1); // Remove from active toasts array
        }

        clearInterval(intervalId); // Clear the timeAgo update interval

        // Remove the toast (or its container link) from the DOM
        if (containerElement.parentNode) {
          containerElement.parentNode.removeChild(containerElement);
        }

        // Smoothly reposition remaining toasts after one is removed
        updateToastPositionsSmooth();
      }, 400); // Matches the CSS transition duration for 'hide'
    }, 5000); // Toast display duration (5 seconds)

    // Store timeout reference for potential cleanup (e.g., on page unload)
    toast._hideTimeout = hideTimeout;
  }

  /**
   * Generates a cache key based on the current site and widget IDs.
   * This ensures cached data is unique per site and widget.
   * @returns {string} The cache key.
   */
  function getCacheKey() {
    // Use currentSiteId and currentWidgetId which are populated after successful JWT API call
    return `social_proof_events_${currentSiteId}_${currentWidgetId}`;
  }

  /**
   * Saves events, site ID, widget ID, and widget config to local storage cache.
   * @param {Array} events - The array of events to cache.
   * @param {string} siteId - The current site ID.
   * @param {string} widgetId - The current widget ID.
   * @param {Object} widgetConfig - The current widget configuration.
   */
  function saveEventsToCache(events, siteId, widgetId, widgetConfig) {
    const cacheData = {
      events,
      timestamp: Date.now(),
      siteId,
      widgetId,
      widgetConfig,
      lastShownIndex: -1 // Reset last shown index for new cache
    };

    try {
      localStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
      console.log('[SocialProof] Events cached successfully');
    } catch (error) {
      console.error('[SocialProof] Failed to cache events:', error);
    }
  }

  /**
   * Loads events, site ID, widget ID, and widget config from local storage cache.
   * Checks for cache validity based on `CONFIG.CACHE_DURATION`.
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

      // Check if cache is still valid (within configured duration)
      if (now - cacheData.timestamp > CONFIG.CACHE_DURATION) {
        console.log('[SocialProof] Cache expired, will fetch fresh events');
        localStorage.removeItem(getCacheKey()); // Clear expired cache
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
   * This introduces variability in event display timing.
   * @returns {number} Delay in seconds.
   */
  function getRandomDelay() {
    const isShortDelay = Math.random() < 0.5; // 50% chance for a short delay
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
   * Retrieves a random fallback event from the `fallbackEvents` array.
   * Ensures the same event is not shown consecutively if there are multiple events.
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
    } while (eventIndex === lastShownEventIndex && fallbackEvents.length > 1); // Avoid repetition

    lastShownEventIndex = eventIndex; // Store the index of the last shown event
    const event = fallbackEvents[eventIndex];
    console.log('[SocialProof] Selected event:', event);
    return event;
  }

  /**
   * Formats an event object into a display message.
   * Prioritizes custom rich text messages if available, otherwise falls back to a default string.
   * @param {Object} event - The event object containing `event_data` and `event_type`.
   * @returns {Array|string} The formatted message, ready for `renderRichText`.
   */
  function formatEventMessage(event) {
    // Check if event has a custom message (rich text array or string)
    if (event.event_data && event.event_data.message) {
      return event.event_data.message;
    }

    // Fallback to a default string message if no custom message is provided
    const name = event.event_data?.name || 'Someone';
    return `${name} just did: ${event.event_type}`;
  }

  /**
   * Displays the next event, prioritizing events from the live queue,
   * then falling back to cached events.
   */
  function displayNextEvent() {
    let eventToShow = null;

    // Check for live events first (events received via broadcast channel)
    if (liveEventQueue.length > 0) {
      eventToShow = liveEventQueue.shift(); // Get the oldest live event
      console.log('[SocialProof] Displaying live event:', eventToShow);
    } else {
      // If no live events, use a random fallback event from cache
      eventToShow = getRandomFallbackEvent();
      if (eventToShow) {
        console.log('[SocialProof] Displaying fallback event:', eventToShow);
      } else {
        console.log('[SocialProof] No events available to display');
        console.log('[SocialProof] Debug info - currentSiteId:', currentSiteId, 'fallbackEvents.length:', fallbackEvents.length);
      }
    }

    // Only show toast if an event is available
    if (eventToShow) {
      const message = formatEventMessage(eventToShow);
      const timestamp = eventToShow.timestamp;
      showToast(message, timestamp, eventToShow.event_type);
    }

    // Schedule the next event display
    scheduleNextEvent();
  }

  /**
   * Schedules the next event to be displayed after a calculated delay.
   * Adjusts delay based on whether the script is in burst mode or normal mode.
   */
  function scheduleNextEvent() {
    // Clear any existing timer to prevent multiple simultaneous timers
    if (eventDisplayTimer) {
      clearTimeout(eventDisplayTimer);
    }

    let delay;

    if (isBurstMode) {
      delay = getBurstDelay() * 1000; // Shorter delay for burst mode
      burstEventCount++;

      // End burst mode after a certain number of events have been shown
      if (burstEventCount >= 2) { // Display at least 2 events in burst mode
        isBurstMode = false;
        burstEventCount = 0;
        console.log('[SocialProof] Burst mode complete, switching to normal mode');
      }
    } else {
      delay = getRandomDelay() * 1000; // Normal, more varied delay
    }

    console.log(`[SocialProof] Next event in ${delay/1000}s (${isBurstMode ? 'burst' : 'normal'} mode)`);

    // Set a timeout to display the next event
    eventDisplayTimer = setTimeout(() => {
      displayNextEvent();
    }, delay);
  }

  /**
   * Initiates burst mode, causing events to be displayed more rapidly for a short period.
   */
  function startBurstMode() {
    console.log('[SocialProof] Starting burst mode');
    isBurstMode = true;
    burstEventCount = 0; // Reset count for the new burst
    // The actual number of events in a burst is determined by `burstEventCount >= 2` in `scheduleNextEvent`

    // Immediately display the first event of the burst
    displayNextEvent();
  }

  // --- JWT-based API calls (from previous response) ---

  /**
   * Refreshes the JWT token by calling the backend API.
   * This is crucial for maintaining authentication without exposing API keys.
   * @returns {Promise<boolean>} True if token was refreshed successfully, false otherwise.
   */
  async function refreshJWTToken() {
    try {
      console.log('[SocialProof] Refreshing JWT token...');

      const response = await fetch(NEXT_PUBLIC_APP_URL+'/api/embed/auth/get-jwt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentToken: currentJWTToken }) // Send current token for backend validation/renewal
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh token: ${response.status}`);
      }

      const data = await response.json();
      currentJWTToken = data.token; // Update the current JWT token
      console.log('[SocialProof] JWT token refreshed successfully');

      return true;
    } catch (error) {
      console.error('[SocialProof] Failed to refresh JWT token:', error);
      return false;
    }
  }

  /**
   * Initializes the widget by fetching its configuration and fallback events
   * from the backend using the JWT token. Handles token expiration and refresh.
   * This replaces the direct Supabase calls for initial data.
   * @returns {Promise<boolean>} True if initialization was successful, false otherwise.
   */
  async function initializeWidget() {
    try {
      console.log('[SocialProof] Initializing widget with JWT token...');

      const response = await fetch(NEXT_PUBLIC_APP_URL+'/api/embed/events/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jwtToken: currentJWTToken }) // Send JWT for authentication
      });

      if (!response.ok) {
        // If token is unauthorized/expired, attempt to refresh and retry
        if (response.status === 401) {
          console.log('[SocialProof] JWT token expired, attempting refresh...');
          const refreshSuccess = await refreshJWTToken();
          if (refreshSuccess) {
            // Retry initialization with the newly refreshed token
            return await initializeWidget();
          }
        }
        throw new Error(`Failed to initialize widget: ${response.status}`);
      }

      const data = await response.json();
      console.log('[SocialProof] Widget initialization response:', data);

      // Populate global state variables with data from the API response
      currentSiteId = data.siteId;
      currentWidgetId = data.widgetConfig.id; // Use widgetConfig.id for currentWidgetId
      currentWidgetConfig = data.widgetConfig;
      fallbackEvents = data.fallbackEvents || [];

      // Save the fetched data to cache for faster subsequent loads
      saveEventsToCache(fallbackEvents, currentSiteId, currentWidgetId, currentWidgetConfig);

      return true;
    } catch (error) {
      console.error('[SocialProof] Failed to initialize widget:', error);
      return false;
    }
  }

  /**
   * Handles incoming live event payloads from the Supabase broadcast channel.
   * Adds the event to the live event queue or displays it immediately if not in burst mode.
   * @param {Object} payload - The live event data received.
   */
  function handleLiveEvent(payload) {
    console.log('[SocialProof] Received live event:', payload);
    const message = payload.message || 'A new event occurred!';
    const timestamp = payload.timestamp || new Date().toISOString(); // Ensure timestamp exists

    if (isBurstMode) {
      // If in burst mode, queue the event to be displayed as part of the burst
      liveEventQueue.push({ message, timestamp, event_type: payload.event_type || 'info' });
    } else {
      // Otherwise, display the live event immediately
      showToast(message, timestamp, payload.event_type || 'info');
    }
  }

  /**
   * Starts the periodic display of social proof events.
   * Initiates burst mode at the start.
   */
  function startEventDisplay() {
    console.log('[SocialProof] Starting event display system');
    console.log('[SocialProof] Current state - fallbackEvents:', fallbackEvents.length, 'currentSiteId:', currentSiteId, 'currentWidgetId:', currentWidgetId);

    // Begin by entering burst mode to quickly show initial events
    startBurstMode();
  }

  /**
   * Starts the periodic JWT token refresh mechanism.
   * This ensures the client's token remains valid for API calls.
   */
  function startTokenRefresh() {
    tokenRefreshTimer = setInterval(async () => {
      await refreshJWTToken();
    }, CONFIG.TOKEN_REFRESH_INTERVAL);
  }

  /**
   * Cleans up timers and removes active toasts when the script is unloaded
   * (e.g., when the user navigates away from the page).
   */
  function cleanup() {
    // Clear all scheduled timers
    if (eventDisplayTimer) {
      clearTimeout(eventDisplayTimer);
    }
    if (burstModeTimer) {
      clearTimeout(burstModeTimer);
    }
    if (tokenRefreshTimer) {
      clearInterval(tokenRefreshTimer);
    }

    // Initiate exit animations and remove all active toasts from the DOM
    activeToasts.forEach(toast => {
      if (toast._hideTimeout) {
        clearTimeout(toast._hideTimeout); // Cancel any pending hide timeouts
      }
      toast.classList.add('hide'); // Trigger CSS exit animation
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 400); // Wait for animation to complete
    });

    activeToasts = []; // Clear the array of active toasts
  }

  // --- Main Initialization Flow ---

  // Validate that the JWT token is provided via the script attribute
  if (!jwtToken) {
    console.error('[SocialProof] JWT token is required. Please provide jwt-token attribute.');
    return; // Stop script execution if essential parameter is missing
  }

  // Dynamically load the Supabase client library for the broadcast channel
  const scriptTag = document.createElement('script');
  scriptTag.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  scriptTag.onload = async () => {
    console.log('[SocialProof] Supabase script loaded');

    try {
      // Initialize Supabase client using the anonymous key for the broadcast channel
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('[SocialProof] Supabase client created for broadcast channel');

      // Attempt to load initial data (events and widget config) from local storage cache first
      const cachedData = loadEventsFromCache();

      if (cachedData && cachedData.events.length > 0 && cachedData.siteId && cachedData.widgetId && cachedData.widgetConfig) {
        // If valid cached data exists, use it
        fallbackEvents = cachedData.events;
        currentWidgetConfig = cachedData.widgetConfig;
        currentSiteId = cachedData.siteId;
        currentWidgetId = cachedData.widgetId;
        lastShownEventIndex = cachedData.lastShownIndex;
        console.log('[SocialProof] Using cached events and config:', fallbackEvents.length);
      } else {
        // If no valid cache, fetch fresh data via the JWT-authenticated API route
        console.log('[SocialProof] No valid cache, initializing widget via JWT API...');
        const initSuccess = await initializeWidget();
        if (!initSuccess) {
          console.error('[SocialProof] Widget initialization failed. Aborting script.');
          return; // Stop if initial API fetch fails
        }
      }

      // Set up the Supabase broadcast subscription ONLY after currentWidgetId is available
      // This ID is crucial for subscribing to the correct event channel.
      if (currentWidgetId) {
        console.log(`[SocialProof] Setting up broadcast subscription for widget ID: ${currentWidgetId}...`);
        const channel = supabaseClient
          .channel('social-proof-events') // General channel name
          .on(
            'broadcast',
            { event: `social-proof-event-${currentWidgetId}` }, // Specific event name using the widget ID
            handleLiveEvent // Callback for incoming live events
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
                console.log('[SocialProof] Subscription closed');
                break;
            }
          });
      } else {
        console.warn('[SocialProof] currentWidgetId not available after initialization, skipping broadcast channel setup.');
      }

      // Start the event display system to show toasts
      startEventDisplay();

      // Start periodic token refresh to keep the JWT valid for future API calls
      startTokenRefresh();

    } catch (error) {
      console.error('[SocialProof] Error during main initialization flow:', error);
    }
  };

  // Handle errors if the Supabase script fails to load
  scriptTag.onerror = () => {
    console.error('[SocialProof] Failed to load Supabase script');
  };

  // Add a cleanup function to run before the page unloads
  window.addEventListener('beforeunload', cleanup);

  // Append the Supabase script tag to the document head to start loading
  document.head.appendChild(scriptTag);
})();
