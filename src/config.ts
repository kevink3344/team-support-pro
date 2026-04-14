export const appConfig = {
  appName: import.meta.env.VITE_APP_NAME || 'TeamSupportPro',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
} as const

export const apiUrl = (path: string) => `${appConfig.apiBaseUrl}${path}`