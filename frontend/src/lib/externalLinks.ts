/** External IRPSM / partner URLs used by the SSO-integrated chrome. */

// Indian Railways public portal — opened by the "IR Map" button on the landing page.
export const IR_PORTAL_URL = 'https://indianrailways.gov.in/index/index.html';

// IRPSM logoff endpoint. Users arrive via the IRPSM SSO handoff, so logging out of PIA
// clears the PIA session and returns them here (not to PIA's own login page).
// NOTE: this is the *trial* host — update to the production IRPSM logoff URL before go-live.
export const IRPSM_LOGOFF_URL = 'https://trial.ircep.gov.in/IRPSM/LogoffController';
