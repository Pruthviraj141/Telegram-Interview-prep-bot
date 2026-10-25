import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: {
    default: "AI Interview Coach",
    template: "%s · AI Interview Coach",
  },
  description:
    "Source-grounded interview practice with adaptive follow-ups, honest scoring, and a debrief after every round.",
  applicationName: "AI Interview Coach",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#121316" },
  ],
};

/**
 * Resolve the stored theme before first paint so there is no flash. Kept
 * inline and tiny: it may only touch `documentElement.dataset.theme` and
 * `colorScheme`. The cookie mirrors the resolved value for future
 * server-rendered surfaces; localStorage is the source of truth.
 */
const themeScript = `(function(){try{var s=localStorage.getItem("theme")||"system";var m=window.matchMedia("(prefers-color-scheme: dark)");var t=s==="dark"||(s==="system"&&m.matches)?"dark":"light";var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;document.cookie="theme="+t+";path=/;max-age=31536000;samesite=lax";}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
