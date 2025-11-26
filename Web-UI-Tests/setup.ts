// Global setup file for browser tests
// This adds an unhandled rejection listener to help debug test errors

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Global unhandled rejection:', event.reason)
    console.error('Promise:', event.promise)
    // Print stack trace if available
    if (event.reason?.stack) {
      console.error('Stack:', event.reason.stack)
    }
  })
}
