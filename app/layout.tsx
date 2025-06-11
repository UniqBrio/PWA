import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Task Manager PWA',
  description: 'A Progressive Web App for managing tasks with push notifications.',
  generator: 'Next.js',
  manifest: '/manifest.json',
  // PWA specific metadata consolidated here
  applicationName: 'Task Manager PWA',
  appleWebApp: {
    capable: true,
    title: 'Tasks', // Title for Apple home screen icon
    statusBarStyle: 'default', // Or 'black', 'black-translucent'
  },
  themeColor: '#000000', // Matches manifest.json theme_color
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover', // Added viewport-fit=cover for better edge-to-edge display on notched devices
  icons: {
    apple: '/icons/apple-touch-icon.png', // Ensure this icon exists in your /public/icons folder
    // You can add other icons here if needed, Next.js also reads from manifest.json
  },
  // formatDetection: { telephone: false }, // Optional: Prevents auto-linking of phone numbers
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head />
      {/*
        Next.js will automatically populate the <head> with tags from the `metadata` object.
        If you have other tags not covered by the metadata API (e.g., custom scripts, specific link preloads),
        you can add them here, ensuring no leading/trailing whitespace around them.
      */}
      <body>{children}</body>
    </html>
  )
}
