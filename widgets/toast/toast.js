(function () {
  const SUPABASE_URL = 'https://uyzmxzjdnnerroiojmao.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5em14empkbm5lcnJvaW9qbWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3MTkwOTgsImV4cCI6MjA2NzI5NTA5OH0.DYy8Vos2p2A9ollMdGGJCsumYWiqb15hIZFyAy-Hbiw';
  
  // Get both API keys from script attributes
  const siteApiKey = document.currentScript.getAttribute('site-api-key');
  const widgetApiKey = document.currentScript.getAttribute('widget-api-key');
  const widget_id = document.currentScript.getAttribute('widget-id');
  const site_id = document.currentScript.getAttribute('site-id');
  
  console.log('[SocialProof] Script starting with Site API key:', siteApiKey, 'Widget API key:', widgetApiKey);
  
  
  // Configuration
  const CONFIG = {
    CACHE_DURATION: 2 * 24 * 60 * 60 * 1000, // 2 days in milliseconds
    FALLBACK_EVENT_COUNT: 15,
    BURST_INTERVAL: 3 * 60 * 1000, // 3 minutes
    BURST_VARIANCE: 2 * 60 * 1000 // +/- 2 minutes
  };
  
  // State management
  let supabaseClient = null;
  let eventDisplayTimer = null;
  let burstModeTimer = null;
  let currentSiteId = null;
  let currentWidgetConfig = null;
  let fallbackEvents = [];
  let lastShownEventIndex = -1;
  let isBurstMode = false;
  let burstEventCount = 0;
  let liveEventQueue = [];
  
  // Toast stacking management
  let activeToasts = [];

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
        opacity: 20;
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
  
  // Utility functions
  function updateToastPositionsSmooth() {
    const customStyles = currentWidgetConfig?.styles?.["info"] || {};
    const hasTop = customStyles.top !== undefined;
    const hasBottom = customStyles.bottom !== undefined;
    const hasLeft = customStyles.left !== undefined;
    const hasRight = customStyles.right !== undefined;
    
    let offset = 20;
    
    // Use requestAnimationFrame for smoother positioning
    requestAnimationFrame(() => {
      // Determine stacking direction and positioning
      if (hasTop && !hasBottom) {
        // Stack downward from top
        activeToasts.forEach((toast, index) => {
          toast.style.top = offset + 'px';
          toast.style.bottom = 'auto';
          offset += toast.offsetHeight + 10; // 10px gap between toasts
          
          // Add stacked class for additional animations
          if (index > 0) {
            toast.classList.add('stacked');
          }
        });
      } else {
        // Default: stack upward from bottom
        activeToasts.forEach((toast, index) => {
          toast.style.bottom = offset + 'px';
          toast.style.top = 'auto';
          offset += toast.offsetHeight + 10; // 10px gap between toasts
          
          // Add stacked class for additional animations
          if (index > 0) {
            toast.classList.add('stacked');
          }
        });
      }
      
      // Ensure horizontal positioning is preserved with smooth transitions
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
  
  function updateToastPositions() {
    updateToastPositionsSmooth();
  }
  
  function applyCustomStyles(toast, customStyles) {
    console.log("CUSTOM STYLES", customStyles)
    if (!customStyles) return;
    
    // Apply custom styles from widget configuration
    console.log("CUSTOM STYLES:", customStyles)
    Object.keys(customStyles).forEach(key => {
      const cssProperty = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      
      // For certain properties, add smooth transitions
      if (['background', 'color', 'border-radius', 'padding', 'margin'].includes(cssProperty)) {
        toast.style.transition = toast.style.transition + `, ${cssProperty} 0.3s ease`;
      }
      
      toast.style.setProperty(cssProperty, customStyles[key]);
    });
  }
  
  function renderRichText(message) {
    // Check if message is an array (rich text) or string (fallback)
    if (Array.isArray(message)) {
      return message.map(segment => {
        const span = document.createElement('span');
        span.className = 'rich-text';
        span.textContent = segment.value;
        
        // Apply styles
        if (segment.style) {
          span.classList.add(segment.style);
        }
        
        // Apply color
        if (segment.color) {
          span.style.color = segment.color;
        }
        
        return span;
      });
    } else {
      // Fallback for string messages
      const span = document.createElement('span');
      span.textContent = message;
      return [span];
    }
  }
  
  function showToast(message, timestamp, event_type) {
    console.log('[SocialProof] Showing toast:', message);
  
    const toast = document.createElement('div');
    toast.className = 'sps-toast';
  
    const href = currentWidgetConfig?.href;
    let containerElement = toast; // Default container is the toast itself
  
    // If href exists, create a wrapper link
    if (href) {
      const aTag = document.createElement("a");
      aTag.href = href;
      aTag.style.textDecoration = 'none'; // Remove default link styling
      aTag.style.color = 'inherit'; // Inherit color from toast
      aTag.appendChild(toast);
      containerElement = aTag; // Container becomes the link
    }
  
    // Determine animation direction and apply styles based on current widget config
    const defaultStyle = currentWidgetConfig?.styles?.[event_type] || currentWidgetConfig?.default_style || 'default';
    const customStyles = currentWidgetConfig?.styles?.[defaultStyle] || {};
    
    console.log("XLM: DEFAULT STYLE", defaultStyle);
    console.log("XLM: CUSTOM STYLES", customStyles);
  
    const hasLeft = customStyles.left !== undefined;
    const hasRight = customStyles.right !== undefined;
    const hasTop = customStyles.top !== undefined;
    const hasBottom = customStyles.bottom !== undefined;
  
    // Set animation class based on positioning
    if (hasLeft && !hasRight) {
      toast.classList.add('from-left');
    } else if (hasRight && !hasLeft) {
      toast.classList.add('from-right');
    } else if (hasTop && !hasBottom) {
      toast.classList.add('from-top');
    } else if (hasBottom && !hasTop) {
      toast.classList.add('from-bottom');
    } else {
      // Default: from right
      toast.classList.add('from-right');
    }
  
    // Apply custom widget styles if available - FIXED: pass the specific style object
    if (currentWidgetConfig && currentWidgetConfig.styles) {
      applyCustomStyles(toast, customStyles); // ✅ Pass the specific style object, not the entire styles container
    }
  
    // Render rich text or plain text
    const textElements = renderRichText(message);
    textElements.forEach(element => {
      toast.appendChild(element);
    });
  
    // Add footer with time ago and "Powered by Hooklify"
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
    timeAgoEl.style.color = customStyles?.color || 'rgba(255, 255, 255, 0.8)'; // Use the actual style color
  
    // Update time every 5 seconds
    const intervalId = setInterval(() => {
      timeAgoEl.textContent = timeAgo(timestamp);
    }, 5000);
  
    // Powered by element
    const poweredBy = document.createElement('span');
    poweredBy.innerHTML = 'Powered by <a href="https://hooklify.vercel.app" target="_blank" rel="noopener noreferrer" style="color:rgb(38, 100, 40); text-decoration: none; font-weight: 700; font-size: 12px">Hooklify</a>';
  
    footer.appendChild(timeAgoEl);
    footer.appendChild(poweredBy);
    toast.appendChild(footer);
  
    // Add to DOM first (but invisible) - use containerElement (either toast or aTag)
    document.body.appendChild(containerElement);
  
    // Add to active toasts array
    activeToasts.push(toast);
  
    // Update positions with smooth transition
    updateToastPositions();
  
    // Force reflow to ensure initial state is applied
    toast.offsetHeight;
  
    // Show the toast with smooth animation
    // Use requestAnimationFrame for smoother timing
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
  
    // Enhanced hide sequence with better timing
    const hideTimeout = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
  
      // Wait for exit animation to complete
      setTimeout(() => {
        // Remove from active toasts array
        const index = activeToasts.indexOf(toast);
        if (index > -1) {
          activeToasts.splice(index, 1);
        }
  
        clearInterval(intervalId);
  
        // Remove from DOM - remove the container element
        if (containerElement.parentNode) {
          containerElement.parentNode.removeChild(containerElement);
        }
  
        // Smooth repositioning of remaining toasts
        updateToastPositionsSmooth();
      }, 400); // Match the CSS transition duration
    }, 5000);
  
    // Store timeout reference for potential cleanup
    toast._hideTimeout = hideTimeout;
  }
  
  function getCleanApiKey(apiKey, prefix) {
    if (!apiKey) return null;
    const cleaned = apiKey.startsWith(prefix) ? apiKey.substring(prefix.length) : apiKey;
    console.log('[SocialProof] Original API key:', apiKey, 'Cleaned:', cleaned);
    return cleaned;
  }
  
  function getCacheKey() {
    const cleanSiteKey = getCleanApiKey(siteApiKey, 'site_');
    const cleanWidgetKey = getCleanApiKey(widgetApiKey, 'widget_');
    return `social_proof_events_${cleanSiteKey}_${cleanWidgetKey}`;
  }
  
  function saveEventsToCache(events, siteId, widgetConfig) {
    const cacheData = {
      events,
      timestamp: Date.now(),
      siteId,
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
  
  function loadEventsFromCache() {
    try {
      const cached = localStorage.getItem(getCacheKey());
      if (!cached) {
        console.log('[SocialProof] No cached events found');
        return null;
      }
      
      const cacheData = JSON.parse(cached);
      const now = Date.now();
      
      // Check if cache is still valid (within 2 days)
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
    console.log('[SocialProof] Getting random fallback event. Available events:', fallbackEvents.length);
    
    if (fallbackEvents.length === 0) {
      console.log('[SocialProof] No fallback events available');
      return null;
    }
    
    // Avoid showing the same event consecutively
    let eventIndex;
    do {
      eventIndex = Math.floor(Math.random() * fallbackEvents.length);
    } while (eventIndex === lastShownEventIndex && fallbackEvents.length > 1);
    
    lastShownEventIndex = eventIndex;
    const event = fallbackEvents[eventIndex];
    console.log('[SocialProof] Selected event:', event);
    return event;
  }
  
  function formatEventMessage(event) {
    // Check if event has a custom message (rich text array or string)
    if (event.event_data && event.event_data.message) {
      return event.event_data.message;
    }
    
    // Fallback to default format (as string)
    const name = event.event_data?.name || 'Someone';
    return `${name} just did: ${event.event_type}`;
  }
  
  function displayNextEvent() {
    let eventToShow = null;
    let isLiveEvent = false;
    
    // Check for live events first
    if (liveEventQueue.length > 0) {
      eventToShow = liveEventQueue.shift();
      isLiveEvent = true;
      console.log('[SocialProof] Displaying live event:', eventToShow);
    } else {
      // Use fallback event
      eventToShow = getRandomFallbackEvent();
      if (eventToShow) {
        console.log('[SocialProof] Displaying fallback event:', eventToShow);
      } else {
        console.log('[SocialProof] No events available to display');
        console.log('[SocialProof] Debug info - currentSiteId:', currentSiteId, 'fallbackEvents.length:', fallbackEvents.length);
      }
    }
    
    // Only show toast if we have an event
    if (eventToShow) {
      const message = formatEventMessage(eventToShow);
      const timestamp = eventToShow.timestamp;
      showToast(message, timestamp, eventToShow.event_type);
    }
    
    // Schedule next event
    scheduleNextEvent();
  }
  
  function scheduleNextEvent() {
    // Clear existing timer
    if (eventDisplayTimer) {
      clearTimeout(eventDisplayTimer);
    }
    
    let delay;
    
    if (isBurstMode) {
      delay = getBurstDelay() * 1000;
      burstEventCount++;
      
      // Check if burst mode is complete
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
  
  function startBurstMode() {
    console.log('[SocialProof] Starting burst mode');
    isBurstMode = true;
    burstEventCount = Math.floor(Math.random() * 4) + 2; // 2-5 events
    
    const showBurstEvent = () => {
      if (burstEventCount > 0) {
        const message = liveEventQueue.length > 0 ? liveEventQueue.shift() : null;
        if (message) {
          showToast(message);
        }
        burstEventCount--;
        setTimeout(showBurstEvent, (Math.random() * 5 + 2) * 1000); // 2-7 seconds between events
      } else {
        isBurstMode = false;
        console.log('[SocialProof] Burst mode complete, switching to normal mode');
      }
    };
    showBurstEvent();
  }
  
  async function fetchFallbackEvents() {
    if (!supabaseClient || !currentSiteId) {
      console.error('[SocialProof] Cannot fetch events: missing supabase client or site ID');
      console.log('[SocialProof] Debug - supabaseClient:', !!supabaseClient, 'currentSiteId:', currentSiteId);
      return [];
    }
    
    try {
      console.log('[SocialProof] Fetching fallback events for site:', currentSiteId);
      
      const { data, error } = await supabaseClient
        .from('events')
        .select('*')
        .eq('site_id', currentSiteId)
        .limit(CONFIG.FALLBACK_EVENT_COUNT);
      
      if (error) {
        console.error('[SocialProof] Error fetching events:', error);
        return [];
      }
      
      console.log('[SocialProof] Fetched events:', data?.length || 0, 'events:', data);
      return data || [];
    } catch (error) {
      console.error('[SocialProof] Exception fetching events:', error);
      return [];
    }
  }
  
  async function fetchWidgetConfig() {
    if (!supabaseClient || !widgetApiKey) {
      console.error('[SocialProof] Cannot fetch widget config: missing supabase client or widget API key');
      return null;
    }
    
    try {
      const cleanWidgetKey = getCleanApiKey(widgetApiKey, 'widget_');
      console.log('[SocialProof] Fetching widget config for key:', cleanWidgetKey);

      const response = await fetch(
        `/api/widgets/initialize-widget` +
        `?siteId=${currentSiteId}` +      // currentSiteId is set by getSiteIdFromApiKey
        `&widgetId=${widget_id}` +        // <- use widget_id, not currentWidgetId
        `&siteApiKey=${siteApiKey}` +     // <- use siteApiKey
        `&widgetApiKey=${widgetApiKey}`   // <- use widgetApiKey
      );  const data = await response.json();
      
      if (response.status !== 200) {
        console.error('[SocialProof] Error fetching widget config:', response.status);
        return null;
      }
      if (!data) {
        console.error('[SocialProof] Widget config not found for key:', cleanWidgetKey);
        return null;
      }
      
      console.log('[SocialProof] Fetched widget config:', data);
      return data;
    } catch (error) {
      console.error('[SocialProof] Exception fetching widget config:', error);
      return null;
    }
  }
  
  async function initializeFallbackEvents() {
    console.log('[SocialProof] Initializing fallback events...');
    
    // Try to load from cache first
    const cachedData = loadEventsFromCache();
    // const cachedData = null;
    
    if (cachedData && cachedData.events.length > 0) {
      fallbackEvents = cachedData.events;
      currentWidgetConfig = cachedData.widgetConfig;
      lastShownEventIndex = cachedData.lastShownIndex;
      console.log('[SocialProof] Using cached events:', fallbackEvents.length);
      return;
    }
    
    // Fetch widget config
    currentWidgetConfig = await fetchWidgetConfig();
    
    // Only fetch if we have a site ID
    if (currentSiteId) {
      console.log('[SocialProof] Fetching fresh events for site:', currentSiteId);
      const events = await fetchFallbackEvents();
      
      if (events.length > 0) {
        fallbackEvents = events;
        saveEventsToCache(events, currentSiteId, currentWidgetConfig);
        console.log('[SocialProof] Fetched and cached fresh events:', events.length);
      } else {
        console.warn('[SocialProof] No fallback events available for site');
      }
    } else {
      console.warn('[SocialProof] No site ID available, cannot fetch fallback events');
    }
  }
  
  async function getSiteIdFromApiKey() {
    if (!supabaseClient || !siteApiKey) {
      console.error('[SocialProof] Cannot lookup site: missing supabase client or site API key');
      console.log('[SocialProof] Debug - supabaseClient:', !!supabaseClient, 'siteApiKey:', siteApiKey);
      return null;
    }
    
    try {
      const cleanSiteKey = getCleanApiKey(siteApiKey, 'site_');
      console.log('[SocialProof] Looking up site for API key:', cleanSiteKey);
      
      const { data, error } = await supabaseClient
        .from('sites')
        .select('id, site_url')
        .eq('api_key', cleanSiteKey)
        .single();
      
      if (error) {
        console.error('[SocialProof] Error looking up site by API key:', error);
        console.log('[SocialProof] Full error details:', error);
        return null;
      }
      
      console.log('[SocialProof] Found site:', data);
      return data?.id;
    } catch (error) {
      console.error('[SocialProof] Exception looking up site by API key:', error);
      return null;
    }
  }
  
  function handleLiveEvent(payload) {
    console.log('[SocialProof] Received live event:', payload);
    const message = payload.message || 'A new event occurred!';
    const timestamp = payload.timestamp;

    if (isBurstMode) {
      liveEventQueue.push(message);
    } else {
      showToast(message, timestamp);
    }
  }
  
  function startEventDisplay() {
    console.log('[SocialProof] Starting event display system');
    console.log('[SocialProof] Current state - fallbackEvents:', fallbackEvents.length, 'currentSiteId:', currentSiteId);
    
    // Start with burst mode
    startBurstMode();
    
    // Display first event immediately
    setTimeout(() => {
      displayNextEvent();
    }, 1000);
  }
  
  function cleanup() {
    if (eventDisplayTimer) {
      clearTimeout(eventDisplayTimer);
    }
    if (burstModeTimer) {
      clearTimeout(burstModeTimer);
    }
    
    // Clean up any remaining toasts with smooth exit
    activeToasts.forEach(toast => {
      // Cancel any pending hide timeouts
      if (toast._hideTimeout) {
        clearTimeout(toast._hideTimeout);
      }
      
      // Smooth exit animation
      toast.classList.add('hide');
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 400);
    });
    
    activeToasts = [];
  }
  
  // Validate required parameters
  if (!siteApiKey || !widgetApiKey) {
    console.error('[SocialProof] Missing required API keys. Both site-api-key and widget-api-key are required.');
    return;
  }
  
  // Initialize everything
  // console.log('[SocialProof] Testing toast...');
  // showToast([
  //   {value: 'Social proof script loaded successfully!', style: 'bold', color: '#4CAF50'}
  // ]);
  
  const scriptTag = document.createElement('script');
  scriptTag.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  scriptTag.onload = async () => {
    console.log('[SocialProof] Supabase script loaded');
    
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('[SocialProof] Supabase client created');
      
      // Get site ID from API key
      console.log('[SocialProof] Getting site ID from API key...');
      currentSiteId = await getSiteIdFromApiKey();
      console.log('[SocialProof] Site ID result:', currentSiteId);
      
      if (!currentSiteId) {
        console.error('[SocialProof] Could not determine site ID from API key');
        console.log('[SocialProof] This means either:');
        console.log('1. The site API key is incorrect');
        console.log('2. The site doesn\'t exist in the database');
        console.log('3. There\'s a database connection issue');
        return;
      }
      
      // Initialize fallback events and widget config
      console.log('[SocialProof] Initializing fallback events and widget config...');
      await initializeFallbackEvents();
      console.log('[SocialProof] Fallback events initialized. Count:', fallbackEvents.length);
      console.log('[SocialProof] Widget config:', currentWidgetConfig);
      
      // Set up broadcast subscription
      console.log('[SocialProof] Setting up broadcast subscription...');
      
      const channel = supabaseClient
        .channel('social-proof-events')
        .on(
          'broadcast',
          { event: `social-proof-event-${widget_id}` },
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
              console.log('[SocialProof] Subscription closed');
              break;
          }
        });
      
      // Start the event display system
      startEventDisplay();
      
    } catch (error) {
      console.error('[SocialProof] Error initializing:', error);
    }
  };
  
  scriptTag.onerror = () => {
    console.error('[SocialProof] Failed to load Supabase script');
  };
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
  
  document.head.appendChild(scriptTag);
})();
