/**
 * The app's scrolling element. The document itself does not scroll (see RootLayout), so
 * anything that needs to read, lock or restore scroll has to reach this element instead of
 * `window`.
 */
export const APP_SCROLLER_ID = 'app-scroller'

export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
