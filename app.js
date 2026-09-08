// ============================================================
// VOICECHAT - NEW APP
// ============================================================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  onChildAdded,
  off
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";


// ============================================================
// 1. FIREBASE CONFIG
// ============================================================
// REPLACE THESE VALUES WITH YOUR FIREBASE PROJECT VALUES.
// ============================================================

const firebaseConfig = {

apiKey: "AIzaSyAVy5nFd6sjyoVSYnnqRfXJpu29FstxFZc",
  authDomain: "voice-chat01-63e85.firebaseapp.com",
  databaseURL: "https://voice-chat01-63e85-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "voice-chat01-63e85",
  storageBucket: "voice-chat01-63e85.firebasestorage.app",
  messagingSenderId: "113293901393",
  appId: "1:113293901393:web:bfbca6f5da36368e274270"
};


// ============================================================
// 2. FIREBASE INITIALIZATION
// ============================================================

const app =
  initializeApp(firebaseConfig);

const auth =
  getAuth(app);

const db =
  getDatabase(app);


// ============================================================
// 3. HELPERS
// ============================================================

const $ = id =>
  document.getElementById(id);


function show(element) {

  if (element) {
    element.classList.remove("hidden");
  }

}


function hide(element) {

  if (element) {
    element.classList.add("hidden");
  }

}


function getInitials(name = "User") {

  const parts =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2);

  return parts
    .map(part =>
      part.charAt(0).toUpperCase()
    )
    .join("") || "U";
}


function escapeText(value = "") {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatDuration(seconds) {

  seconds =
    Math.max(
      0,
      Number(seconds) || 0
    );

  const minutes =
    Math.floor(seconds / 60);

  const remaining =
    seconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remaining).padStart(2, "0")
  );
}


// ============================================================
// 4. STATE
// ============================================================

let currentUser = null;

let usersUnsubscribe = null;

let historyUnsubscribe = null;

let callsListenerStarted = false;

let currentCallId = null;

let currentCallRole = null;

let currentRemoteUser = null;

let peerConnection = null;

let localStream = null;

let callStartTime = null;

let callTimerInterval = null;

let isMuted = false;

let isSpeakerOn = true;

let pendingIncomingCall = null;

let pendingCandidates = [];


// ============================================================
// 5. WEBRTC CONFIG
// ============================================================

const rtcConfig = {

  iceServers: [

    {
      urls:
        "stun:stun.l.google.com:19302"
    },

    {
      urls:
        "stun:stun1.l.google.com:19302"
    }

  ]

};


// ============================================================
// 6. AUTH
// ============================================================

$("loginBtn")?.addEventListener(
  "click",
  login
);


$("registerBtn")?.addEventListener(
  "click",
  register
);


$("logoutBtn")?.addEventListener(
  "click",
  logout
);


async function register() {

  const email =
    $("emailInput")?.value.trim();

  const password =
    $("passwordInput")?.value;

  if (!email || !password) {

    showAuthMessage(
      "Enter an email and password."
    );

    return;
  }

  if (password.length < 6) {

    showAuthMessage(
      "Password must contain at least 6 characters."
    );

    return;
  }

  try {

    const result =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await set(
      ref(
        db,
        `users/${result.user.uid}`
      ),
      {
        uid:
          result.user.uid,

        email,

        name:
          email.split("@")[0],

        createdAt:
          Date.now(),

        online:
          true
      }
    );

    showAuthMessage(
      "Account created."
    );

  } catch (error) {

    console.error(
      "REGISTER ERROR:",
      error
    );

    showAuthMessage(
      friendlyAuthError(error)
    );
  }
}


async function login() {

  const email =
    $("emailInput")?.value.trim();

  const password =
    $("passwordInput")?.value;

  if (!email || !password) {

    showAuthMessage(
      "Enter your email and password."
    );

    return;
  }

  try {

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    showAuthMessage("");

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    showAuthMessage(
      friendlyAuthError(error)
    );
  }
}


async function logout() {

  try {

    await cleanupCall(false);

    if (currentUser) {

      await update(
        ref(
          db,
          `users/${currentUser.uid}`
        ),
        {
          online:
            false,

          lastSeen:
            Date.now()
        }
      );

    }

    await signOut(auth);

  } catch (error) {

    console.error(
      "LOGOUT ERROR:",
      error
    );
  }
}


function friendlyAuthError(error) {

  const code =
    error?.code || "";

  switch (code) {

    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/email-already-in-use":
      return "That email is already registered.";

    case "auth/invalid-email":
      return "Please enter a valid email.";

    case "auth/weak-password":
      return "Password is too weak.";

    case "auth/network-request-failed":
      return "Network error. Check your internet.";

    default:
      return error?.message ||
        "Authentication failed.";
  }
}


function showAuthMessage(message) {

  const element =
    $("authMessage");

  if (element) {
    element.textContent =
      message;
  }

}


// ============================================================
// 7. AUTH STATE
// ============================================================

onAuthStateChanged(
  auth,
  async user => {

    if (user) {

      currentUser =
        user;

      show(
        $("appScreen")
      );

      hide(
        $("authScreen")
      );

      $("currentUserText").textContent =
        user.email;

      await ensureUserProfile();

      startUsersListener();

      startHistoryListener();

      startIncomingCallListener();

    } else {

      currentUser =
        null;

      hide(
        $("appScreen")
      );

      show(
        $("authScreen")
      );

      stopListeners();

      hideAllCallOverlays();

    }

  }
);


// ============================================================
// 8. USER PROFILE
// ============================================================

async function ensureUserProfile() {

  if (!currentUser) {
    return;
  }

  const userRef =
    ref(
      db,
      `users/${currentUser.uid}`
    );

  const snapshot =
    await get(userRef);

  const oldData =
    snapshot.exists()
      ? snapshot.val()
      : {};

  await update(
    userRef,
    {

      uid:
        currentUser.uid,

      email:
        currentUser.email || "",

      name:
        oldData.name ||
        currentUser.email?.split("@")[0] ||
        "User",

      online:
        true,

      lastSeen:
        Date.now()
    }
  );
}


// ============================================================
// 9. USERS
// ============================================================

function startUsersListener() {

  if (usersUnsubscribe) {

    usersUnsubscribe();

    usersUnsubscribe =
      null;
  }

  if (!currentUser) {
    return;
  }

  const usersRef =
    ref(db, "users");

  usersUnsubscribe =
    onValue(
      usersRef,
      snapshot => {

        renderUsers(
          snapshot.val() || {}
        );

      },
      error => {

        console.error(
          "USERS LISTENER ERROR:",
          error
        );

        $("usersList").innerHTML =
          `<p class="empty">
             Unable to load users.
           </p>`;
      }
    );
}


function renderUsers(users) {

  const container =
    $("usersList");

  if (!container) {
    return;
  }

  const list =
    Object.values(users)
      .filter(user =>
        user &&
        user.uid &&
        user.uid !== currentUser?.uid
      )
      .sort(
        (a, b) =>
          String(a.name || "")
            .localeCompare(
              String(b.name || "")
            )
      );

  if (!list.length) {

    container.innerHTML =
      `<p class="empty">
        No other users yet.
      </p>`;

    return;
  }

  container.innerHTML =
    list.map(user => {

      const name =
        user.name ||
        user.email ||
        "User";

      return `

        <div class="user-card">

          <div class="avatar">
            ${escapeText(
              getInitials(name)
            )}
          </div>

          <div class="user-info">

            <div class="user-name">
              ${escapeText(name)}
            </div>

            <div class="user-email">
              ${escapeText(
                user.email || ""
              )}
            </div>

          </div>

          <button
            class="call-user-btn"
            data-call-user="${escapeText(
              user.uid
            )}"
          >
            📞 Call
          </button>

        </div>

      `;

    }).join("");

  container
    .querySelectorAll(
      "[data-call-user]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const uid =
            button.dataset.callUser;

          const user =
            list.find(
              item =>
                item.uid === uid
            );

          if (user) {
            startOutgoingCall(user);
          }

        }
      );

    });
}


// ============================================================
// 10. START OUTGOING CALL
// ============================================================

async function startOutgoingCall(remoteUser) {

  if (!currentUser) {
    return;
  }

  if (currentCallId) {

    alert(
      "You are already in a call."
    );

    return;
  }

  try {

    currentRemoteUser =
      remoteUser;

    currentCallRole =
      "caller";

    localStream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: true,
          video: false
        }
      );

    peerConnection =
      createPeerConnection();

    localStream
      .getTracks()
      .forEach(track => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });

    const callRef =
      push(
        ref(db, "calls")
      );

    currentCallId =
      callRef.key;

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    await set(
      callRef,
      {

        callId:
          currentCallId,

        callerId:
          currentUser.uid,

        callerName:
          getCurrentUserName(),

        callerEmail:
          currentUser.email || "",

        calleeId:
          remoteUser.uid,

        calleeName:
          remoteUser.name ||
          remoteUser.email ||
          "User",

        calleeEmail:
          remoteUser.email || "",

        offer:
          {
            type:
              offer.type,

            sdp:
              offer.sdp
          },

        status:
          "ringing",

        createdAt:
          Date.now()

      }
    );

    showOutgoingCall(
      remoteUser
    );

    listenToCurrentCall();

  } catch (error) {

    console.error(
      "START CALL ERROR:",
      error
    );

    await cleanupCall(false);

    alert(
      "Could not start the call. Make sure microphone permission is allowed."
    );
  }
}


// ============================================================
// 11. PEER CONNECTION
// ============================================================

function createPeerConnection() {

  const pc =
    new RTCPeerConnection(
      rtcConfig
    );

  pc.onicecandidate =
    async event => {

      if (
        !event.candidate ||
        !currentCallId
      ) {
        return;
      }

      try {

        const candidateRef =
          push(
            ref(
              db,
              `calls/${currentCallId}/candidates/${currentUser.uid}`
            )
          );

        await set(
          candidateRef,
          event.candidate.toJSON()
        );

      } catch (error) {

        console.error(
          "ICE SAVE ERROR:",
          error
        );
      }
    };


  pc.ontrack =
    event => {

      const audio =
        $("remoteAudio");

      if (!audio) {
        return;
      }

      audio.srcObject =
        event.streams[0];

      audio.muted =
        !isSpeakerOn;

      audio.play()
        .catch(() => {});

    };


  pc.onconnectionstatechange =
    () => {

      const state =
        pc.connectionState;

      console.log(
        "WEBRTC STATE:",
        state
      );

      if (
        state === "connected"
      ) {

        beginCallTimer();

      }

      if (
        state === "failed" ||
        state === "closed"
      ) {

        cleanupCall(
          false
        );

      }

    };


  return pc;
}


// ============================================================
// 12. INCOMING CALL LISTENER
// ============================================================

function startIncomingCallListener() {

  if (
    callsListenerStarted ||
    !currentUser
  ) {
    return;
  }

  callsListenerStarted =
    true;

  const callsRef =
    ref(db, "calls");

  onChildAdded(
    callsRef,
    snapshot => {

      const call =
        snapshot.val();

      if (!call) {
        return;
      }

      if (
        call.calleeId !==
        currentUser.uid
      ) {
        return;
      }

      if (
        call.status !==
        "ringing"
      ) {
        return;
      }

      if (call.createdAt) {

        const age =
          Date.now() -
          Number(call.createdAt);

        if (age > 60000) {
          return;
        }

      }

      if (
        currentCallId
      ) {
        return;
      }

      showIncomingCall(
        call
      );

    }
  );
}


// ============================================================
// 13. LISTEN TO CURRENT CALL
// ============================================================

function listenToCurrentCall() {

  if (!currentCallId) {
    return;
  }

  const callRef =
    ref(
      db,
      `calls/${currentCallId}`
    );

  const unsubscribe =
    onValue(
      callRef,
      async snapshot => {

        const call =
          snapshot.val();

        if (!call) {
          return;
        }

        // ----------------------------------------------------
        // CALLER RECEIVES ANSWER
        // ----------------------------------------------------

        if (
          currentCallRole ===
          "caller" &&
          call.answer &&
          peerConnection &&
          !peerConnection.currentRemoteDescription
        ) {

          try {

            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(
                call.answer
              )
            );

            await addStoredCandidates();

          } catch (error) {

            console.error(
              "SET ANSWER ERROR:",
              error
            );
          }

        }


        // ----------------------------------------------------
        // CALL ENDED
        // ----------------------------------------------------

        if (
          call.status ===
          "ended"
        ) {

          await cleanupCall(
            false
          );

        }

        // ----------------------------------------------------
        // CALL REJECTED
        // ----------------------------------------------------

        if (
          call.status ===
          "rejected"
        ) {

          await cleanupCall(
            false
          );

        }

      }
    );

  callUnsubscribers.push(
    unsubscribe
  );
}


let callUnsubscribers = [];


// ============================================================
// 14. ACCEPT CALL
// ============================================================

$("acceptCallBtn")?.addEventListener(
  "click",
  acceptIncomingCall
);


async function acceptIncomingCall() {

  const call =
    pendingIncomingCall;

  if (!call) {
    return;
  }

  try {

    currentCallId =
      call.callId;

    currentCallRole =
      "callee";

    currentRemoteUser = {

      uid:
        call.callerId,

      name:
        call.callerName ||
        call.callerEmail ||
        "User",

      email:
        call.callerEmail || ""

    };

    localStream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: true,
          video: false
        }
      );

    peerConnection =
      createPeerConnection();

    localStream
      .getTracks()
      .forEach(track => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        call.offer
      )
    );

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );

    await update(
      ref(
        db,
        `calls/${call.callId}`
      ),
      {

        answer:
          {
            type:
              answer.type,

            sdp:
              answer.sdp
          },

        status:
          "connected",

        answeredAt:
          Date.now()

      }
    );

    hide(
      $("incomingOverlay")
    );

    showActiveCall();

    callStartTime =
      Date.now();

    beginCallTimer();

    await addStoredCandidates();

    listenToCurrentCall();

    pendingIncomingCall =
      null;

  } catch (error) {

    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    await rejectCurrentIncomingCall();

    alert(
      "Could not accept the call. Check microphone permission."
    );
  }
}


// ============================================================
// 15. REJECT CALL
// ============================================================

$("rejectCallBtn")?.addEventListener(
  "click",
  rejectCurrentIncomingCall
);


async function rejectCurrentIncomingCall() {

  const call =
    pendingIncomingCall;

  if (!call) {

    hide(
      $("incomingOverlay")
    );

    return;
  }

  try {

    await update(
      ref(
        db,
        `calls/${call.callId}`
      ),
      {

        status:
          "rejected",

        endedAt:
          Date.now()

      }
    );

    await saveHistoryForUser(
      currentUser.uid,
      call.callId,
      {

        remoteUid:
          call.callerId,

        remoteName:
          call.callerName ||
          call.callerEmail ||
          "User",

        remoteEmail:
          call.callerEmail || "",

        status:
          "rejected",

        duration:
          0,

        timestamp:
          Date.now()

      }
    );

  } catch (error) {

    console.error(
      "REJECT ERROR:",
      error
    );

  }

  pendingIncomingCall =
    null;

  hide(
    $("incomingOverlay")
  );
}


// ============================================================
// 16. CANCEL OUTGOING CALL
// ============================================================

$("cancelCallBtn")?.addEventListener(
  "click",
  cancelOutgoingCall
);


async function cancelOutgoingCall() {

  if (!currentCallId) {

    await cleanupCall(false);

    return;
  }

  const callId =
    currentCallId;

  try {

    const snapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    const call =
      snapshot.exists()
        ? snapshot.val()
        : null;

    // --------------------------------------------------------
    // THIS IS IMPORTANT:
    // If the caller cancels while the other person has not
    // answered, the other person's history gets a MISSED CALL.
    // --------------------------------------------------------

    if (
      call &&
      call.status ===
      "ringing"
    ) {

      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {

          status:
            "missed",

          endedAt:
            Date.now()

        }
      );

      await saveHistoryForUser(
        call.calleeId,
        callId,
        {

          remoteUid:
            call.callerId,

          remoteName:
            call.callerName ||
            call.callerEmail ||
            "User",

          remoteEmail:
            call.callerEmail ||
            "",

          status:
            "missed",

          duration:
            0,

          timestamp:
            Date.now()

        }
      );

      await saveHistoryForUser(
        call.callerId,
        callId,
        {

          remoteUid:
            call.calleeId,

          remoteName:
            call.calleeName ||
            call.calleeEmail ||
            "User",

          remoteEmail:
            call.calleeEmail ||
            "",

          status:
            "cancelled",

          duration:
            0,

          timestamp:
            Date.now()

        }
      );

    } else {

      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {

          status:
            "ended",

          endedAt:
            Date.now()

        }
      );

    }

  } catch (error) {

    console.error(
      "CANCEL CALL ERROR:",
      error
    );
  }

  await cleanupCall(false);
}


// ============================================================
// 17. END ACTIVE CALL
// ============================================================

$("endCallBtn")?.addEventListener(
  "click",
  endCall
);


async function endCall() {

  const callId =
    currentCallId;

  if (!callId) {

    await cleanupCall(false);

    return;
  }

  try {

    const snapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    const call =
      snapshot.exists()
        ? snapshot.val()
        : null;

    await update(
      ref(
        db,
        `calls/${callId}`
      ),
      {

        status:
          "ended",

        endedAt:
          Date.now()

      }
    );

    if (call) {

      await saveHistoryForUser(
        currentUser.uid,
        callId,
        {

          remoteUid:
            currentRemoteUser?.uid ||
            "",

          remoteName:
            currentRemoteUser?.name ||
            currentRemoteUser?.email ||
            "User",

          remoteEmail:
            currentRemoteUser?.email ||
            "",

          status:
            "ended",

          duration:
            getCallDuration(),

          timestamp:
            Date.now()

        }
      );

    }

  } catch (error) {

    console.error(
      "END CALL ERROR:",
      error
    );

  }

  await cleanupCall(false);
}


// ============================================================
// 18. CALL TIMER
// ============================================================

function beginCallTimer() {

  if (!callStartTime) {
    callStartTime =
      Date.now();
  }

  stopCallTimer();

  callTimerInterval =
    setInterval(
      updateCallTimer,
      1000
    );

  updateCallTimer();
}


function updateCallTimer() {

  if (!callStartTime) {

    $("callTimer").textContent =
      "00:00";

    return;
  }

  $("callTimer").textContent =
    formatDuration(
      getCallDuration()
    );
}


function getCallDuration() {

  if (!callStartTime) {
    return 0;
  }

  return Math.floor(
    (
      Date.now() -
      callStartTime
    ) / 1000
  );
}


function stopCallTimer() {

  if (callTimerInterval) {

    clearInterval(
      callTimerInterval
    );

    callTimerInterval =
      null;
  }
}


// ============================================================
// 19. MUTE
// ============================================================

$("muteBtn")?.addEventListener(
  "click",
  () => {

    if (!localStream) {
      return;
    }

    isMuted =
      !isMuted;

    localStream
      .getAudioTracks()
      .forEach(track => {

        track.enabled =
          !isMuted;

      });

    $("muteBtn").textContent =
      isMuted
        ? "🔇 Unmute"
        : "🎤 Mute";

  }
);


// ============================================================
// 20. SPEAKER
// ============================================================

$("speakerBtn")?.addEventListener(
  "click",
  () => {

    const audio =
      $("remoteAudio");

    if (!audio) {
      return;
    }

    isSpeakerOn =
      !isSpeakerOn;

    audio.muted =
      !isSpeakerOn;

    $("speakerBtn").textContent =
      isSpeakerOn
        ? "🔊 Speaker"
        : "🔇 Speaker";

  }
);


// ============================================================
// 21. ADD ICE CANDIDATES
// ============================================================

async function addStoredCandidates() {

  if (
    !currentCallId ||
    !peerConnection
  ) {
    return;
  }

  try {

    const candidatesRef =
      ref(
        db,
        `calls/${currentCallId}/candidates`
      );

    const snapshot =
      await get(candidatesRef);

    if (!snapshot.exists()) {
      return;
    }

    const allCandidates =
      snapshot.val();

    for (
      const userId in allCandidates
    ) {

      if (
        userId ===
        currentUser.uid
      ) {
        continue;
      }

      const candidates =
        allCandidates[userId];

      for (
        const key in candidates
      ) {

        try {

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              candidates[key]
            )
          );

        } catch (error) {

          console.warn(
            "ICE ADD ERROR:",
            error
          );

        }

      }

    }

  } catch (error) {

    console.error(
      "CANDIDATE LOAD ERROR:",
      error
    );

  }
}


// ============================================================
// 22. HISTORY
// ============================================================

function startHistoryListener() {

  if (historyUnsubscribe) {

    historyUnsubscribe();

    historyUnsubscribe =
      null;
  }

  if (!currentUser) {
    return;
  }

  const historyRef =
    ref(
      db,
      `callHistory/${currentUser.uid}`
    );

  historyUnsubscribe =
    onValue(
      historyRef,
      snapshot => {

        renderHistory(
          snapshot.val() || {}
        );

      },
      error => {

        console.error(
          "HISTORY ERROR:",
          error
        );

        $("historyList").innerHTML =
          `<p class="empty">
             Unable to load call history.
           </p>`;
      }
    );
}


function renderHistory(history) {

  const container =
    $("historyList");

  if (!container) {
    return;
  }

  const entries =
    Object.values(history)
      .sort(
        (a, b) =>
          Number(b.timestamp || 0) -
          Number(a.timestamp || 0)
      );

  if (!entries.length) {

    container.innerHTML =
      `<p class="empty">
        No call history yet.
      </p>`;

    return;
  }

  container.innerHTML =
    entries
      .map(item => {

        const name =
          item.remoteName ||
          item.remoteEmail ||
          "User";

        const status =
          item.status ||
          "ended";

        let statusText =
          "📞 Completed";

        let statusClass =
          "completed";

        if (
          status ===
          "missed"
        ) {

          statusText =
            "📵 Missed Call";

          statusClass =
            "missed";

        } else if (
          status ===
          "cancelled"
        ) {

          statusText =
            "↩️ Cancelled";

          statusClass =
            "rejected";

        } else if (
          status ===
          "rejected"
        ) {

          statusText =
            "❌ Rejected";

          statusClass =
            "rejected";

        }

        const date =
          item.timestamp
            ? new Date(
                item.timestamp
              ).toLocaleString()
            : "";

        return `

          <div class="history-item">

            <div class="avatar">
              ${escapeText(
                getInitials(name)
              )}
            </div>

            <div class="history-info">

              <div class="history-name">
                ${escapeText(name)}
              </div>

              <div class="history-email">
                ${escapeText(
                  item.remoteEmail || ""
                )}
              </div>

              <div class="history-meta">

                <span class="history-status ${statusClass}">
                  ${statusText}
                </span>

                <span class="history-duration">
                  ${formatDuration(
                    item.duration || 0
                  )}
                </span>

              </div>

              <div class="history-email">
                ${escapeText(date)}
              </div>

            </div>

          </div>

        `;

      })
      .join("");
}


// ============================================================
// 23. SAVE HISTORY
// ============================================================

async function saveHistoryForUser(
  uid,
  callId,
  data
) {

  if (!uid || !callId) {
    return;
  }

  try {

    await set(
      ref(
        db,
        `callHistory/${uid}/${callId}`
      ),
      {

        callId,

        remoteUid:
          data.remoteUid || "",

        remoteName:
          data.remoteName || "User",

        remoteEmail:
          data.remoteEmail || "",

        status:
          data.status || "ended",

        duration:
          Number(data.duration) || 0,

        timestamp:
          Number(data.timestamp) ||
          Date.now()

      }
    );

  } catch (error) {

    console.error(
      "SAVE HISTORY ERROR:",
      error
    );
  }
}


// ============================================================
// 24. CURRENT USER NAME
// ============================================================

function getCurrentUserName() {

  if (!currentUser) {
    return "User";
  }

  return (
    currentUser.displayName ||
    currentUser.email?.split("@")[0] ||
    "User"
  );
}


// ============================================================
// 25. OUTGOING UI
// ============================================================

function showOutgoingCall(user) {

  $("outgoingName").textContent =
    user.name ||
    user.email ||
    "User";

  $("outgoingStatus").textContent =
    "Calling...";

  $("outgoingAvatar").textContent =
    getInitials(
      user.name ||
      user.email ||
      "User"
    );

  show(
    $("outgoingOverlay")
  );
}


// ============================================================
// 26. INCOMING UI
// ============================================================

function showIncomingCall(call) {

  pendingIncomingCall =
    call;

  const name =
    call.callerName ||
    call.callerEmail ||
    "User";

  $("incomingName").textContent =
    name;

  $("incomingAvatar").textContent =
    getInitials(name);

  show(
    $("incomingOverlay")
  );
}


// ============================================================
// 27. ACTIVE CALL UI
// ============================================================

function showActiveCall() {

  const name =
    currentRemoteUser?.name ||
    currentRemoteUser?.email ||
    "User";

  $("activeName").textContent =
    name;

  $("activeAvatar").textContent =
    getInitials(name);

  $("callStatus").textContent =
    "Connected";

  show(
    $("activeCallOverlay")
  );

  hide(
    $("outgoingOverlay")
  );

  hide(
    $("incomingOverlay")
  );
}


// ============================================================
// 28. HIDE CALL UI
// ============================================================

function hideAllCallOverlays() {

  hide(
    $("incomingOverlay")
  );

  hide(
    $("outgoingOverlay")
  );

  hide(
    $("activeCallOverlay")
  );
}


// ============================================================
// 29. CLEANUP
// ============================================================

async function cleanupCall(
  updateDatabase = false
) {

  const callId =
    currentCallId;

  if (
    updateDatabase &&
    callId
  ) {

    try {

      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {

          status:
            "ended",

          endedAt:
            Date.now()

        }
      );

    } catch (error) {

      console.error(
        "CLEANUP DATABASE ERROR:",
        error
      );

    }
  }


  stopCallTimer();


  callUnsubscribers
    .forEach(
      unsubscribe => {

        try {
          unsubscribe();
        } catch (_) {}

      }
    );


  callUnsubscribers =
    [];


  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => {

        try {
          track.stop();
        } catch (_) {}

      });

    localStream =
      null;
  }


  if (peerConnection) {

    try {
      peerConnection.close();
    } catch (_) {}

    peerConnection =
      null;
  }


  const audio =
    $("remoteAudio");

  if (audio) {

    audio.srcObject =
      null;

    audio.muted =
      false;
  }


  currentCallId =
    null;

  currentCallRole =
    null;

  currentRemoteUser =
    null;

  pendingIncomingCall =
    null;

  pendingCandidates =
    [];

  callStartTime =
    null;

  isMuted =
    false;

  isSpeakerOn =
    true;


  $("muteBtn").textContent =
    "🎤 Mute";

  $("speakerBtn").textContent =
    "🔊 Speaker";


  hideAllCallOverlays();
}


// ============================================================
// 30. STOP LISTENERS
// ============================================================

function stopListeners() {

  if (usersUnsubscribe) {

    try {
      usersUnsubscribe();
    } catch (_) {}

    usersUnsubscribe =
      null;
  }


  if (historyUnsubscribe) {

    try {
      historyUnsubscribe();
    } catch (_) {}

    historyUnsubscribe =
      null;
  }


  callsListenerStarted =
    false;

}


// ============================================================
// 31. REFRESH HISTORY
// ============================================================

$("refreshHistoryBtn")?.addEventListener(
  "click",
  () => {

    startHistoryListener();

  }
);


// ============================================================
// 32. PAGE CLOSE
// ============================================================

window.addEventListener(
  "beforeunload",
  () => {

    stopCallTimer();

    if (localStream) {

      localStream
        .getTracks()
        .forEach(track => {

          try {
            track.stop();
          } catch (_) {}

        });

    }

    if (peerConnection) {

      try {
        peerConnection.close();
      } catch (_) {}

    }

  }
);


// ============================================================
// 33. STARTUP
// ============================================================

console.log(
  "✅ NEW VOICECHAT APP LOADED"
);
