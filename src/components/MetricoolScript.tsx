import Script from "next/script";

// Metricool site-analytics tracker, mounted once from the root layout
// (client-provided snippet, Jul 2026). The hash identifies the Juvenex
// property in Metricool; it is public by design (ships to every visitor).
const METRICOOL_HASH =
  process.env.NEXT_PUBLIC_METRICOOL_HASH ?? "2d58b31286a5ddb9f397c8e4e616df2e";

/**
 * Vendor loader verbatim (their snippet appends be.js to <head> and inits
 * beTracker on load), wrapped in next/script so it runs afterInteractive
 * instead of blocking parse. If be.js is blocked or fails, onload never
 * fires and nothing throws. tracker.metricool.com is allowlisted in the
 * CSP (script-src + connect-src + img-src) in src/proxy.ts.
 */
export default function MetricoolScript() {
  const hash = JSON.stringify(METRICOOL_HASH);
  return (
    <Script id="metricool-tracker" strategy="afterInteractive">
      {`if(!window.__JUVENEX_NATIVE__){(function(){function loadScript(a){var b=document.getElementsByTagName("head")[0],c=document.createElement("script");c.type="text/javascript",c.src="https://tracker.metricool.com/resources/be.js",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){try{window.beTracker.t({hash:${hash}})}catch(e){}})})();}`}
    </Script>
  );
}
