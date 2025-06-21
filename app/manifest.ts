import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Task Manager PWA',
    short_name: 'Tasks',
    description: 'A Progressive Web App with push notifications for managing tasks.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icons/icon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable', // Changed from 'any' for better icon adaptability
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    screenshots: [
      {
        src: '/screenshots/desktop-screenshot-1.png',
        sizes: '1919x964',
        type: 'image/png',
      },
      {
        src: '/screenshots/mobile-screenshot-1.png',
        sizes: '403x831',
        type: 'image/png',
      },
    ],
  }
}