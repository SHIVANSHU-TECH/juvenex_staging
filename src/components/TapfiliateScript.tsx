import Script from "next/script";
import { TAPFILIATE_ACCOUNT_ID } from "@/lib/tapfiliate";

/**
 * Site-wide Tapfiliate tracking, mounted once from the root layout.
 *
 * Loads the Tapfiliate library, then bootstraps the `tap()` command queue and
 * runs `tap('create', ...)` + `tap('detect')` so a visitor's `?ref=<code>` is
 * captured into the referral cookie on every page (that's what attributes a
 * referral click to an affiliate).
 *
 * Resilience: the inline bootstrap installs `window.tap` as a self-contained
 * queue. Even if tapfiliate.js is blocked, slow, or fails to load, `tap(...)`
 * calls (here and on the conversion page) never throw — they simply buffer
 * onto `tap.q` until the library loads and drains them.
 */
export default function TapfiliateScript() {
  // Account id comes from NEXT_PUBLIC_TAPFILIATE_ACCOUNT_ID (public, so it is
  // safe to inline). JSON.stringify keeps the value correctly quoted/escaped.
  const accountId = JSON.stringify(TAPFILIATE_ACCOUNT_ID);

  return (
    <>
      <Script
        src="https://script.tapfiliate.com/tapfiliate.js"
        strategy="afterInteractive"
      />
      <Script id="tapfiliate-init" strategy="afterInteractive">
        {`if(!window.__JUVENEX_NATIVE__){(function(t,a,p){t.TapfiliateObject=a;t[a]=t[a]||function(){(t[a].q=t[a].q||[]).push(arguments)}})(window,'tap');tap('create', ${accountId}, { integration: "javascript" });tap('detect');` +
          // Also capture ?ref= into a first-party cookie so a paid membership can
          // be attributed server-side (reliable backstop to the client pixel,
          // which is commonly blocked). 90-day window, matches Tapfiliate default.
          `try{var _r=new URLSearchParams(location.search).get('ref');if(_r){document.cookie='juvenex_ref='+encodeURIComponent(_r)+'; max-age=7776000; path=/; SameSite=Lax'}}catch(e){}}`}
      </Script>
    </>
  );
}
