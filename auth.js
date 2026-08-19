// Shared session helpers for the CT Soccer "ctsoccer_user" record.
//
// "Stay signed in" (the login checkbox) controls where the session lives:
//   checked   -> localStorage   (survives closing/reopening the browser)
//   unchecked -> sessionStorage (cleared when the browser closes, but
//                                 survives page refreshes/navigation)
//
// Always read/write through these helpers instead of touching
// localStorage/sessionStorage directly for the "ctsoccer_user" key, so every
// page agrees on where the session actually lives.

function ctsoccerGetUser() {
  try {
    const s = sessionStorage.getItem('ctsoccer_user');
    if (s) return JSON.parse(s);
  } catch (e) {}
  try {
    const l = localStorage.getItem('ctsoccer_user');
    if (l) return JSON.parse(l);
  } catch (e) {}
  return null;
}

function ctsoccerSetUser(user, stay) {
  const json = JSON.stringify(user);
  if (stay) {
    localStorage.setItem('ctsoccer_user', json);
    sessionStorage.removeItem('ctsoccer_user');
  } else {
    sessionStorage.setItem('ctsoccer_user', json);
    localStorage.removeItem('ctsoccer_user');
  }
}

// Is the current session in localStorage (i.e. was "Stay signed in" checked)?
function ctsoccerIsStaySignedIn() {
  return localStorage.getItem('ctsoccer_user') !== null;
}

// Save an update to whichever store already holds the session.
function ctsoccerUpdateUser(user) {
  ctsoccerSetUser(user, ctsoccerIsStaySignedIn());
}

function ctsoccerClearUser() {
  localStorage.removeItem('ctsoccer_user');
  sessionStorage.removeItem('ctsoccer_user');
}
