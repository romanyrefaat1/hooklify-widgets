```"use client"

import React, { useEffect, useState } from 'react';
import Script from 'next/script';

export default function EmbedToast() {
  const [jwtToken, setJwtToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await fetch('https://hooklify.vercel.app/api/embed/auth/get-jwt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            "x-site-api-key": "YOUR_SITE_API_KEY",
            "x-widget-api-key": "YOUR_WIDGET_API_KEY"
          },
          body: JSON.stringify({
            siteId: "YOUR_SITE_ID",
            widgetId: "YOUR_WIDGET_ID"
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch JWT token: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const fetchedToken = data.token;

        if (!fetchedToken) {
          throw new Error('JWT token not found in API response.');
        }

        setJwtToken(fetchedToken); // Store the fetched token in state
      } catch (err) {
        console.error('[SocialProofWidget] Error fetching JWT token:', err);
        setError(err.message); // Store the error message
      } finally {
        setLoading(false); // Set loading to false once the token fetch is complete (success or error)
      }
    };

    fetchToken();
  }, []); // Empty dependency array ensures this effect runs only once on mount

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-gray-500">
        <svg className="animate-spin h-5 w-5 mr-3 text-blue-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading social proof widget...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
        Error loading social proof widget: {error}
      </div>
    );
  }

  // Only render the Script component if the JWT token has been successfully fetched
  if (jwtToken) {
    return (
      <Script
        src="https://cdn.jsdelivr.net/gh/romanyrefaat1/hooklify-widgets@main/widgets/toast/toast.js"
        strategy="afterInteractive"
        data-jwt-token={jwtToken}
        onLoad={() => {
          console.log('[SocialProofWidget] Social proof script loaded from /embed/toast.js');
        }}
        onError={(e) => {
          console.error('[SocialProofWidget] Error loading social proof script:', e);
          setError('Failed to load social proof script.');
        }}
      />
    );
  }

  // If not loading, no error, and no token (shouldn't happen if error is handled), return null
  return null;
};```
