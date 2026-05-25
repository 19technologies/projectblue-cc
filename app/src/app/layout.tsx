import { FaviconLinks } from "@/components/FaviconLinks";
import type { Metadata, Viewport } from "next";
import { Archivo, EB_Garamond, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});

// Wide bold grotesk for the Project Blue word-mark — a free, reliable
// stand-in for Neue Haas Grotesk Display.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Project Blue",
    template: "%s — Project Blue",
  },
  description:
    "Listen together — even when you're apart. A quiet place to play music in time with someone else.",
  applicationName: "Project Blue",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Project Blue",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F5FD" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0D1A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <FaviconLinks />
        {/* Boot the saved theme (or prefers-color-scheme) before paint
            so we don't flash the wrong palette. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('pb-theme');
                if (!t && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
                if (!t) t = 'light';
                document.documentElement.setAttribute('data-theme', t);
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${garamond.variable} ${archivo.variable}`}
      >
        <a href="#main" className="pb-skip">Skip to main content</a>
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
