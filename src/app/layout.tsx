import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { Providers } from "./providers";
import TapfiliateScript from "@/components/TapfiliateScript";
import MetricoolScript from "@/components/MetricoolScript";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import NativeAppGate from "@/components/NativeAppGate";
import { BASE_PATH } from "@/lib/base-path";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Browser/OS chrome color for the standalone (app-store wrapper) experience.
export const viewport: Viewport = {
  themeColor: "#2D352C",
};

export const metadata: Metadata = {
  title: "Juvenex - Your GLP-1 Journey Companion",
  description: "Track your weight, meals, GLP-1 protocols, and community progress with Juvenex",
  icons: {
    icon: [
      { url: `${BASE_PATH}/favicon.png`, type: "image/png" },
    ],
    apple: [
      { url: `${BASE_PATH}/apple-icon.png`, type: "image/png" },
    ],
  },
  openGraph: {
    title: "Juvenex - Your GLP-1 Journey Companion",
    description: "Track your weight, meals, GLP-1 protocols, and community progress with smart insights",
    type: "website",
    siteName: "Juvenex",
  },
  twitter: {
    card: "summary_large_image",
    title: "Juvenex - Your GLP-1 Journey Companion",
    description: "Track your weight, meals, GLP-1 protocols, and community progress with smart insights",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* Pre-paint app gate: inside the native shell (which injects
            window.__JUVENEX_NATIVE__ before content loads) a cold launch on a
            marketing path must NEVER flash the marketing website — the #1
            "this is just a website" App Store 4.2 signal. This runs before any
            React paint; NativeAppGate remains the SPA-navigation backstop. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(window.__JUVENEX_NATIVE__){var base='/staging';var p=location.pathname;if(p.indexOf(base)===0)p=p.slice(base.length)||'/';if(['/','/landing','/landing-new','/home'].indexOf(p)>-1||p==='/store'||p.indexOf('/store/')===0){document.documentElement.style.background='#FAF9F6';location.replace(base+(localStorage.getItem('auth_token')?'/dashboard':'/login'))}}}catch(e){}",
          }}
        />
        {/* Prefix same-origin relative fetch() with basePath before any client JS runs. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var b=${JSON.stringify('/staging')};if(!b||window.__jxBaseFetch)return;window.__jxBaseFetch=1;var o=window.fetch.bind(window);function pref(p){if(!p||p.charAt(0)!=='/'||p.indexOf('//')===0)return p;if(p===b||p.indexOf(b+'/')===0)return p;return b+p;}window.fetch=function(i,n){try{if(typeof i==='string'){i=pref(i);}else if(i&&typeof Request!=='undefined'&&i instanceof Request){var u=new URL(i.url);if(u.origin===location.origin){var r=pref(u.pathname)+u.search+u.hash;if(r!==u.pathname+u.search+u.hash)i=new Request(u.origin+r,i);}}}catch(e){}return o(i,n);};})();`,
          }}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1000] focus:bg-white focus:text-[var(--accent-strong)] focus:px-4 focus:py-2 focus:rounded-md focus:shadow-md"
        >
          Skip to main content
        </a>
        <Providers>
          <NativeAppGate />
          {children}
        </Providers>
        <TapfiliateScript />
        <MetricoolScript />
        <ClientErrorReporter />
      </body>
    </html>
  );
}
