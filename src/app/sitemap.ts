import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://juvenex.space'
  return [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/store`, lastModified: new Date() },
    { url: `${baseUrl}/learn`, lastModified: new Date() },
    { url: `${baseUrl}/telehealth`, lastModified: new Date() },
    { url: `${baseUrl}/community`, lastModified: new Date() },
  ]
}
