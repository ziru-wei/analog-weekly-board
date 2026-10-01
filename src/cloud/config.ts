// Placeholder until a real OAuth client exists — see docs/google-drive-setup.md.
export const PLACEHOLDER_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || PLACEHOLDER_CLIENT_ID;
export const isCloudConfigured = GOOGLE_CLIENT_ID !== PLACEHOLDER_CLIENT_ID && GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');
// `drive.appdata` is a hidden per-app folder: the app can't see (or touch) any of the user's other Drive files.
export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
// Deployed worker/ (see worker/README.md). With it, the extensions use the OAuth code flow and get long-lived refresh tokens.
export const AUTH_WORKER_URL: string = (import.meta.env.VITE_AUTH_WORKER_URL || '').replace(/\/$/, '');
