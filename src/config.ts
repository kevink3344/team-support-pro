export const appConfig = {
  appName: import.meta.env.VITE_APP_NAME || 'TeamSupportPro',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
} as const

export const apiUrl = (path: string) => `${appConfig.apiBaseUrl}${path}`
export const hasGoogleClientId = appConfig.googleClientId.length > 0