// ============================================================
// VOICECHAT
// Complete Firebase + WebRTC Voice Calling Application
// ============================================================

// ============================================================
// 1. FIREBASE IMPORTS
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
  push,
  onValue,
  onChildAdded,
  onDisconnect,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";


// ============================================================
// 2. FIREBASE CONFIG
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
// 3. FIREBASE INITIALIZATION
// ============================================================

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);


// ============================================================
// 4. CONSTANTS
// ============================================================

const CALL_TIMEOUT = 30 * 1000;


// ============================================================
// 5. HELPERS
// ============================================================

const $ = (id) => document.getElementById(id);

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
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return (
    parts
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"
  );
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
  const total = Math.max(0, Number(seconds) || 0);

  const minutes = Math.floor(total / 60);
  const remaining = total % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remaining).padStart(2, "0")
  );
}

function now() {
  return Date.now();
}


// ============================================================
// 6. STATE
// ============================================================

let currentUser = null;

let currentCallId = null;
let currentCallRole = null;
let currentRemoteUser = null;

let pendingIncomingCall = null;

let peerConnection = null;
let localStream = null;

let callStartTime = null;
let callTimerInterval = null;

let outgoingTimeout = null;

let isMuted = false;
let isSpeakerOn = true;

let usersUnsubscribe = null;
let historyUnsubscribe = null;

let currentCallUnsubscribe = null;
let currentCandidateUnsubscribe = null;

let incomingCallsUnsubscribe = null;

let callsListenerStarted = false;

let callFinishing = false;

let processedIncomingCalls = new Set();


// ============================================================
// 7. WEBRTC CONFIG
// ============================================================

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ],
  iceCandidatePoolSize: 10
};


// ============================================================
// 8. RINGTONE
// ============================================================

const ringtone = $("ringtone");

function startRingtone() {
  if (!ringtone) {
    return;
  }

  try {
    ringtone.currentTime = 0;
    ringtone.loop = true;

    const promise = ringtone.play();

    if (promise) {
      promise.catch((error) => {
        console.warn(
          "Ringtone autoplay blocked:",
          error
        );
      });
    }
  } catch (error) {
    console.warn(
      "Ringtone error:",
      error
    );
  }
}

function stopRingtone() {
  if (!ringtone) {
    return;
  }

  try {
    ringtone.pause();
    ringtone.currentTime = 0;
  } catch (_) {}
}


// ============================================================
// 9. AUTH BUTTONS
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

$("notificationBtn")?.addEventListener(
  "click",
  requestNotifications
);


// ============================================================
// 10. REGISTER
// ============================================================

async function register() {
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

    const name =
      email.split("@")[0];

    await set(
      ref(
        db,
        `users/${result.user.uid}`
      ),
      {
        uid:
          result.user.uid,

        email:
          email,

        name:
          name,

        online:
          true,

        createdAt:
          now(),

        lastSeen:
          now()
      }
    );

    showAuthMessage(
      "Account created successfully."
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


// ============================================================
// 11. LOGIN
// ============================================================

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


// ============================================================
// 12. LOGOUT
// ============================================================

async function logout() {
  try {
    if (currentCallId) {
      await endCall();
    }

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
            now()
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


// ============================================================
// 13. AUTH ERRORS
// ============================================================

function friendlyAuthError(error) {
  const code =
    error?.code || "";

  switch (code) {
    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/invalid-login-credentials":
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
      return (
        error?.message ||
        "Authentication failed."
      );
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
// 14. AUTH STATE
// ============================================================

onAuthStateChanged(
  auth,
  async (user) => {

    if (user) {

      currentUser =
        user;

      show(
        $("appScreen")
      );

      hide(
        $("authScreen")
      );

      if ($("currentUserText")) {
        $("currentUserText").textContent =
          user.email || "User";
      }

      try {

        await ensureUserProfile();

        startUsersListener();

        startHistoryListener();

        startIncomingCallListener();

      } catch (error) {

        console.error(
          "STARTUP ERROR:",
          error
        );

      }

    } else {

      currentUser =
        null;

      hide(
        $("appScreen")
      );

      show(
        $("authScreen")
      );

      stopAllListeners();

      await cleanupCall(
        false
      );

      hideAllCallOverlays();
    }
  }
);


// ============================================================
// 15. USER PROFILE
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
        now()
    }
  );
}


// ============================================================
// 16. USERS LISTENER
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
    ref(
      db,
      "users"
    );

  usersUnsubscribe =
    onValue(
      usersRef,
      (snapshot) => {

        renderUsers(
          snapshot.val() || {}
        );

      },
      (error) => {

        console.error(
          "USERS ERROR:",
          error
        );

        if ($("usersList")) {
          $("usersList").innerHTML =
            `
            <p class="empty">
              Unable to load users.
            </p>
            `;
        }
      }
    );
}


// ============================================================
// 17. RENDER USERS
// ============================================================

function renderUsers(users) {

  const container =
    $("usersList");

  if (!container) {
    return;
  }

  const list =
    Object.values(users)
      .filter(
        (user) =>
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
      `
      <p class="empty">
        No other users yet.
      </p>
      `;

    return;
  }

  container.innerHTML =
    list
      .map((user) => {

        const name =
          user.name ||
          user.email ||
          "User";

        const onlineText =
          user.online
            ? "🟢 Online"
            : "⚫ Offline";

        const disabled =
          currentCallId
            ? "disabled"
            : "";

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

              <div class="user-email">
                ${onlineText}
              </div>

            </div>

            <button
              class="call-user-btn"
              data-call-user="${escapeText(
                user.uid
              )}"
              ${disabled}
            >
              📞 Call
            </button>

          </div>
        `;
      })
      .join("");

  container
    .querySelectorAll(
      "[data-call-user]"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          const uid =
            button.dataset.callUser;

          const user =
            list.find(
              (item) =>
                item.uid === uid
            );

          if (user) {
            startOutgoingCall(
              user
            );
          }
        }
      );
    });
}


// ============================================================
// 18. START OUTGOING CALL
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

  if (
    !remoteUser ||
    !remoteUser.uid
  ) {
    return;
  }

  try {

    callFinishing =
      false;

    currentRemoteUser =
      remoteUser;

    currentCallRole =
      "caller";


    // -----------------------------------------
    // MICROPHONE
    // -----------------------------------------

    localStream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: true,
          video: false
        }
      );


    // -----------------------------------------
    // PEER CONNECTION
    // -----------------------------------------

    peerConnection =
      createPeerConnection();

    localStream
      .getTracks()
      .forEach((track) => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });


    // -----------------------------------------
    // CREATE CALL
    // -----------------------------------------

    const callRef =
      push(
        ref(
          db,
          "calls"
        )
      );

    currentCallId =
      callRef.key;


    // -----------------------------------------
    // CREATE OFFER
    // -----------------------------------------

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );


    // -----------------------------------------
    // SAVE CALL
    // -----------------------------------------

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

        offer: {
          type:
            offer.type,

          sdp:
            offer.sdp
        },

        status:
          "ringing",

        createdAt:
          now()
      }
    );


    // -----------------------------------------
    // IF CALLER CLOSES BROWSER
    // WHILE CALL IS STILL RINGING
    // -----------------------------------------

    await onDisconnect(callRef)
      .update({
        status:
          "missed",

        endedAt:
          serverTimestamp()
      });


    // -----------------------------------------
    // SHOW CALLING
    // -----------------------------------------

    showOutgoingCall(
      remoteUser
    );

    startRingtone();


    // -----------------------------------------
    // LISTEN FOR CALL CHANGES
    // -----------------------------------------

    listenToCurrentCall();


    // -----------------------------------------
    // START 30 SECOND TIMEOUT
    // -----------------------------------------

    startOutgoingTimeout();

  } catch (error) {

    console.error(
      "START CALL ERROR:",
      error
    );

    alert(
      "Could not start the call. Please allow microphone access and check your internet connection."
    );

    await cleanupCall(
      false
    );
  }
}


// ============================================================
// 19. 30 SECOND OUTGOING TIMEOUT
// ============================================================

function startOutgoingTimeout() {

  clearOutgoingTimeout();

  outgoingTimeout =
    setTimeout(
      async () => {

        console.log(
          "⏰ 30 second call timeout."
        );

        await timeoutOutgoingCall();

      },
      CALL_TIMEOUT
    );
}

function clearOutgoingTimeout() {

  if (outgoingTimeout) {

    clearTimeout(
      outgoingTimeout
    );

    outgoingTimeout =
      null;
  }
}


// ============================================================
// 20. TIMEOUT OUTGOING CALL
// ============================================================

async function timeoutOutgoingCall() {

  const callId =
    currentCallId;

  if (!callId) {
    return;
  }

  try {

    const result =
      await runTransaction(
        ref(
          db,
          `calls/${callId}/status`
        ),
        (currentStatus) => {

          if (
            currentStatus ===
            "ringing"
          ) {
            return "missed";
          }

          return;
        }
      );


    // Someone answered at almost
    // exactly the same time.
    if (!result.committed) {

      console.log(
        "Call was already answered or ended."
      );

      return;
    }


    const callSnapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    const call =
      callSnapshot.exists()
        ? callSnapshot.val()
        : null;

    if (call) {

      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {
          endedAt:
            now()
        }
      );


      // Receiver gets MISSED
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
            now()
        }
      );


      // Caller gets CANCELLED
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
            now()
        }
      );
    }

  } catch (error) {

    console.error(
      "TIMEOUT ERROR:",
      error
    );

  }

  stopRingtone();

  await cleanupCall(
    false
  );
}


// ============================================================
// 21. CREATE PEER CONNECTION
// ============================================================

function createPeerConnection() {

  const pc =
    new RTCPeerConnection(
      rtcConfig
    );


  // -----------------------------------------
  // LOCAL ICE
  // -----------------------------------------

  pc.onicecandidate =
    async (event) => {

      if (
        !event.candidate ||
        !currentCallId ||
        !currentUser
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


  // -----------------------------------------
  // REMOTE AUDIO
  // -----------------------------------------

  pc.ontrack =
    (event) => {

      const audio =
        $("remoteAudio");

      if (!audio) {
        return;
      }

      if (event.streams?.[0]) {

        audio.srcObject =
          event.streams[0];
      }

      audio.muted =
        !isSpeakerOn;

      audio.play()
        .catch(() => {});
    };


  // -----------------------------------------
  // CONNECTION STATE
  // -----------------------------------------

  pc.onconnectionstatechange =
    async () => {

      const state =
        pc.connectionState;

      console.log(
        "WEBRTC CONNECTION:",
        state
      );


      if (
        state ===
        "connected"
      ) {

        stopRingtone();

        clearOutgoingTimeout();

        showActiveCall();

        if (!callStartTime) {
          callStartTime =
            now();
        }

        beginCallTimer();


        // Cancel browser disconnect
        // action because call is connected.
        if (
          currentCallId &&
          currentCallRole ===
            "caller"
        ) {

          try {

            await onDisconnect(
              ref(
                db,
                `calls/${currentCallId}`
              )
            ).cancel();

          } catch (_) {}
        }
      }


      if (
        state ===
        "failed"
      ) {

        console.warn(
          "WebRTC connection failed."
        );

        if (currentCallId) {

          try {

            await update(
              ref(
                db,
                `calls/${currentCallId}`
              ),
              {
                status:
                  "ended",

                endedAt:
                  now()
              }
            );

          } catch (_) {}
        }
      }


      if (
        state ===
        "disconnected"
      ) {

        console.warn(
          "WebRTC disconnected."
        );
      }
    };


  return pc;
}


// ============================================================
// 22. INCOMING CALL LISTENER
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
    ref(
      db,
      "calls"
    );


  incomingCallsUnsubscribe =
    onChildAdded(
      callsRef,
      (snapshot) => {

        const call =
          snapshot.val();

        if (!call) {
          return;
        }

        processIncomingCall(
          call
        );
      }
    );


  // IMPORTANT:
  // Also watch all existing calls so that
  // receiver sees when caller cancels
  // or timeout changes status.

  const statusListener =
    onValue(
      callsRef,
      (snapshot) => {

        const calls =
          snapshot.val() || {};

        Object.values(calls)
          .forEach(
            (call) => {

              if (!call) {
                return;
              }

              if (
                call.calleeId !==
                currentUser.uid
              ) {
                return;
              }


              // Caller cancelled/timeout
              if (
                call.status ===
                  "missed" &&
                pendingIncomingCall?.callId ===
                  call.callId
              ) {

                stopRingtone();

                pendingIncomingCall =
                  null;

                hide(
                  $("incomingOverlay")
                );
              }


              // Caller rejected/end state
              if (
                (
                  call.status ===
                    "rejected" ||
                  call.status ===
                    "ended"
                ) &&
                pendingIncomingCall?.callId ===
                  call.callId
              ) {

                stopRingtone();

                pendingIncomingCall =
                  null;

                hide(
                  $("incomingOverlay")
                );
              }


              // Show a ringing call
              if (
                call.status ===
                  "ringing"
              ) {

                processIncomingCall(
                  call
                );
              }
            }
          );
      }
    );


  // Store both listeners in one unsubscribe
  const firstListener =
    incomingCallsUnsubscribe;

  incomingCallsUnsubscribe =
    () => {

      try {
        firstListener?.();
      } catch (_) {}

      try {
        statusListener?.();
      } catch (_) {}
    };
}


// ============================================================
// 23. PROCESS INCOMING CALL
// ============================================================

function processIncomingCall(call) {

  if (!currentUser) {
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

  if (
    call.callerId ===
    currentUser.uid
  ) {
    return;
  }


  // Ignore calls older than 30 seconds
  if (call.createdAt) {

    const age =
      now() -
      Number(
        call.createdAt
      );

    if (
      age >
      CALL_TIMEOUT
    ) {

      markOldCallMissed(
        call
      );

      return;
    }
  }


  // Already busy
  if (
    currentCallId &&
    currentCallId !==
      call.callId
  ) {
    return;
  }


  // Already displaying this call
  if (
    pendingIncomingCall?.callId ===
    call.callId
  ) {
    return;
  }


  if (
    processedIncomingCalls.has(
      call.callId
    )
  ) {
    return;
  }

  processedIncomingCalls.add(
    call.callId
  );


  showIncomingCall(
    call
  );
}


// ============================================================
// 24. MARK OLD CALL MISSED
// ============================================================

async function markOldCallMissed(call) {

  try {

    const result =
      await runTransaction(
        ref(
          db,
          `calls/${call.callId}/status`
        ),
        (status) => {

          if (
            status ===
            "ringing"
          ) {
            return "missed";
          }

          return;
        }
      );


    if (!result.committed) {
      return;
    }


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
          call.callerEmail ||
          "",

        status:
          "missed",

        duration:
          0,

        timestamp:
          now()
      }
    );

  } catch (error) {

    console.error(
      "OLD CALL ERROR:",
      error
    );
  }
}


// ============================================================
// 25. LISTEN TO CURRENT CALL
// ============================================================

function listenToCurrentCall() {

  if (!currentCallId) {
    return;
  }

  if (currentCallUnsubscribe) {
    currentCallUnsubscribe();

    currentCallUnsubscribe =
      null;
  }

  if (currentCandidateUnsubscribe) {
    currentCandidateUnsubscribe();

    currentCandidateUnsubscribe =
      null;
  }


  const callId =
    currentCallId;

  const callRef =
    ref(
      db,
      `calls/${callId}`
    );


  // -----------------------------------------
  // CALL LISTENER
  // -----------------------------------------

  currentCallUnsubscribe =
    onValue(
      callRef,
      async (snapshot) => {

        const call =
          snapshot.val();

        if (!call) {
          return;
        }


        // =====================================
        // CALLER RECEIVES ANSWER
        // =====================================

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


            clearOutgoingTimeout();

            stopRingtone();

            if ($("outgoingStatus")) {
              $("outgoingStatus").textContent =
                "Connecting...";
            }


            await addStoredCandidates();

          } catch (error) {

            console.error(
              "SET ANSWER ERROR:",
              error
            );
          }
        }


        // =====================================
        // CONNECTED
        // =====================================

        if (
          call.status ===
          "connected"
        ) {

          clearOutgoingTimeout();

          stopRingtone();

          showActiveCall();

          if (!callStartTime) {

            callStartTime =
              Number(
                call.answeredAt ||
                call.connectedAt ||
                now()
              );

            beginCallTimer();
          }

          return;
        }


        // =====================================
        // MISSED
        // =====================================

        if (
          call.status ===
          "missed"
        ) {

          clearOutgoingTimeout();

          stopRingtone();

          hideAllCallOverlays();

          await cleanupCall(
            false
          );

          return;
        }


        // =====================================
        // REJECTED
        // =====================================

        if (
          call.status ===
          "rejected"
        ) {

          clearOutgoingTimeout();

          stopRingtone();

          hideAllCallOverlays();

          await cleanupCall(
            false
          );

          return;
        }


        // =====================================
        // ENDED
        // =====================================

        if (
          call.status ===
          "ended"
        ) {

          clearOutgoingTimeout();

          stopRingtone();

          hideAllCallOverlays();

          await cleanupCall(
            false
          );

          return;
        }
      }
    );


  // -----------------------------------------
  // LIVE ICE
  // -----------------------------------------

  const candidatesRef =
    ref(
      db,
      `calls/${callId}/candidates`
    );

  currentCandidateUnsubscribe =
    onChildAdded(
      candidatesRef,
      async (snapshot) => {

        const candidateOwner =
          snapshot.key;

        if (
          candidateOwner ===
          currentUser?.uid
        ) {
          return;
        }

        const candidates =
          snapshot.val();

        if (
          !candidates ||
          !peerConnection
        ) {
          return;
        }

        for (
          const key
          of Object.keys(
            candidates
          )
        ) {

          try {

            await peerConnection.addIceCandidate(
              new RTCIceCandidate(
                candidates[key]
              )
            );

          } catch (error) {

            console.warn(
              "LIVE ICE ERROR:",
              error
            );
          }
        }
      }
    );
}


// ============================================================
// 26. ACCEPT INCOMING CALL
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

    stopRingtone();

    clearOutgoingTimeout();

    currentCallId =
      call.callId;

    currentCallRole =
      "callee";

    currentRemoteUser =
      {
        uid:
          call.callerId,

        name:
          call.callerName ||
          call.callerEmail ||
          "User",

        email:
          call.callerEmail ||
          ""
      };


    // -----------------------------------------
    // CHECK CALL IS STILL RINGING
    // -----------------------------------------

    const callSnapshot =
      await get(
        ref(
          db,
          `calls/${call.callId}`
        )
      );

    if (!callSnapshot.exists()) {

      pendingIncomingCall =
        null;

      hide(
        $("incomingOverlay")
      );

      return;
    }

    const latestCall =
      callSnapshot.val();

    if (
      latestCall.status !==
      "ringing"
    ) {

      pendingIncomingCall =
        null;

      hide(
        $("incomingOverlay")
      );

      return;
    }


    // -----------------------------------------
    // MICROPHONE
    // -----------------------------------------

    localStream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: true,
          video: false
        }
      );


    // -----------------------------------------
    // PEER
    // -----------------------------------------

    peerConnection =
      createPeerConnection();

    localStream
      .getTracks()
      .forEach((track) => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });


    // -----------------------------------------
    // REMOTE OFFER
    // -----------------------------------------

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        latestCall.offer
      )
    );


    // -----------------------------------------
    // ADD EXISTING ICE
    // -----------------------------------------

    await addStoredCandidates();


    // -----------------------------------------
    // CREATE ANSWER
    // -----------------------------------------

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );


    // -----------------------------------------
    // UPDATE CALL
    // -----------------------------------------

    const result =
      await runTransaction(
        ref(
          db,
          `calls/${call.callId}/status`
        ),
        (status) => {

          if (
            status ===
            "ringing"
          ) {
            return "connected";
          }

          return;
        }
      );


    if (!result.committed) {

      alert(
        "This call is no longer available."
      );

      await cleanupCall(
        false
      );

      return;
    }


    await update(
      ref(
        db,
        `calls/${call.callId}`
      ),
      {
        answer: {
          type:
            answer.type,

          sdp:
            answer.sdp
        },

        answeredAt:
          now(),

        connectedAt:
          now()
      }
    );


    // -----------------------------------------
    // UI
    // -----------------------------------------

    pendingIncomingCall =
      null;

    hide(
      $("incomingOverlay")
    );

    showActiveCall();

    callStartTime =
      now();

    beginCallTimer();


    // -----------------------------------------
    // LISTEN
    // -----------------------------------------

    listenToCurrentCall();

  } catch (error) {

    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    alert(
      "Could not accept the call. Please make sure microphone permission is allowed."
    );

    if (call?.callId) {

      await rejectIncomingCallById(
        call.callId
      );
    }

    await cleanupCall(
      false
    );
  }
}


// ============================================================
// 27. REJECT INCOMING CALL
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

  stopRingtone();

  clearOutgoingTimeout();

  await rejectIncomingCallById(
    call.callId
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
        call.callerEmail ||
        "",

      status:
        "rejected",

      duration:
        0,

      timestamp:
        now()
    }
  );


  pendingIncomingCall =
    null;

  hide(
    $("incomingOverlay")
  );
}

async function rejectIncomingCallById(
  callId
) {

  if (!callId) {
    return;
  }

  try {

    const result =
      await runTransaction(
        ref(
          db,
          `calls/${callId}/status`
        ),
        (status) => {

          if (
            status ===
            "ringing"
          ) {
            return "rejected";
          }

          return;
        }
      );

    if (result.committed) {

      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {
          endedAt:
            now()
        }
      );
    }

  } catch (error) {

    console.error(
      "REJECT CALL ERROR:",
      error
    );
  }
}


// ============================================================
// 28. CANCEL OUTGOING CALL
// ============================================================

$("cancelCallBtn")?.addEventListener(
  "click",
  cancelOutgoingCall
);

async function cancelOutgoingCall() {

  const callId =
    currentCallId;

  if (!callId) {

    await cleanupCall(
      false
    );

    return;
  }

  clearOutgoingTimeout();

  try {

    const result =
      await runTransaction(
        ref(
          db,
          `calls/${callId}/status`
        ),
        (status) => {

          if (
            status ===
            "ringing"
          ) {
            return "missed";
          }

          return;
        }
      );


    if (
      result.committed
    ) {

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

      if (call) {

        await update(
          ref(
            db,
            `calls/${callId}`
          ),
          {
            endedAt:
              now()
          }
        );


        // Receiver
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
              now()
          }
        );


        // Caller
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
              now()
          }
        );
      }

    } else {

      console.log(
        "Call was already answered or ended."
      );
    }

  } catch (error) {

    console.error(
      "CANCEL ERROR:",
      error
    );
  }


  stopRingtone();

  await cleanupCall(
    false
  );
}


// ============================================================
// 29. END ACTIVE CALL
// ============================================================

$("endCallBtn")?.addEventListener(
  "click",
  endCall
);

async function endCall() {

  if (callFinishing) {
    return;
  }

  callFinishing =
    true;

  clearOutgoingTimeout();

  const callId =
    currentCallId;

  if (!callId) {

    await cleanupCall(
      false
    );

    callFinishing =
      false;

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
          now()
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
            now()
        }
      );
    }

  } catch (error) {

    console.error(
      "END CALL ERROR:",
      error
    );
  }


  await cleanupCall(
    false
  );

  callFinishing =
    false;
}


// ============================================================
// 30. CALL TIMER
// ============================================================

function beginCallTimer() {

  if (!callStartTime) {
    callStartTime =
      now();
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

  const timer =
    $("callTimer");

  if (!timer) {
    return;
  }

  timer.textContent =
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
      now() -
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
// 31. MUTE
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
      .forEach(
        (track) => {

          track.enabled =
            !isMuted;
        }
      );


    if ($("muteBtn")) {

      $("muteBtn").textContent =
        isMuted
          ? "🔇 Unmute"
          : "🎤 Mute";
    }
  }
);


// ============================================================
// 32. SPEAKER
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


    if ($("speakerBtn")) {

      $("speakerBtn").textContent =
        isSpeakerOn
          ? "🔊 Speaker"
          : "🔇 Speaker";
    }


    if (isSpeakerOn) {

      audio.play()
        .catch(() => {});
    }
  }
);


// ============================================================
// 33. ADD STORED ICE CANDIDATES
// ============================================================

async function addStoredCandidates() {

  if (
    !currentCallId ||
    !peerConnection ||
    !currentUser
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
      await get(
        candidatesRef
      );

    if (!snapshot.exists()) {
      return;
    }

    const allCandidates =
      snapshot.val();

    for (
      const userId
      of Object.keys(
        allCandidates
      )
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
        const key
        of Object.keys(
          candidates || {}
        )
      ) {

        try {

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              candidates[key]
            )
          );

        } catch (error) {

          console.warn(
            "STORED ICE ERROR:",
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
// 34. HISTORY LISTENER
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
      (snapshot) => {

        renderHistory(
          snapshot.val() || {}
        );
      },
      (error) => {

        console.error(
          "HISTORY ERROR:",
          error
        );

        if ($("historyList")) {

          $("historyList").innerHTML =
            `
            <p class="empty">
              Unable to load call history.
            </p>
            `;
        }
      }
    );
}


// ============================================================
// 35. RENDER HISTORY
// ============================================================

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
          Number(
            b.timestamp || 0
          ) -
          Number(
            a.timestamp || 0
          )
      );


  if (!entries.length) {

    container.innerHTML =
      `
      <p class="empty">
        No call history yet.
      </p>
      `;

    return;
  }


  container.innerHTML =
    entries
      .map((item) => {

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
        }

        else if (
          status ===
          "cancelled"
        ) {

          statusText =
            "↩️ Cancelled";

          statusClass =
            "rejected";
        }

        else if (
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
                Number(
                  item.timestamp
                )
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

                <span
                  class="history-status ${statusClass}"
                >
                  ${statusText}
                </span>

                <span
                  class="history-duration"
                >
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
// 36. SAVE HISTORY
// ============================================================

async function saveHistoryForUser(
  uid,
  callId,
  data
) {

  if (
    !uid ||
    !callId
  ) {
    return;
  }

  try {

    await set(
      ref(
        db,
        `callHistory/${uid}/${callId}`
      ),
      {
        callId:
          callId,

        remoteUid:
          data.remoteUid || "",

        remoteName:
          data.remoteName ||
          "User",

        remoteEmail:
          data.remoteEmail || "",

        status:
          data.status ||
          "ended",

        duration:
          Number(
            data.duration
          ) || 0,

        timestamp:
          Number(
            data.timestamp
          ) || now()
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
// 37. CURRENT USER NAME
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
// 38. OUTGOING UI
// ============================================================

function showOutgoingCall(user) {

  const name =
    user.name ||
    user.email ||
    "User";


  if ($("outgoingName")) {
    $("outgoingName").textContent =
      name;
  }

  if ($("outgoingStatus")) {
    $("outgoingStatus").textContent =
      "Calling...";
  }

  if ($("outgoingAvatar")) {
    $("outgoingAvatar").textContent =
      getInitials(name);
  }

  show(
    $("outgoingOverlay")
  );
}


// ============================================================
// 39. INCOMING UI
// ============================================================

function showIncomingCall(call) {

  pendingIncomingCall =
    call;


  const name =
    call.callerName ||
    call.callerEmail ||
    "User";


  if ($("incomingName")) {
    $("incomingName").textContent =
      name;
  }

  if ($("incomingAvatar")) {
    $("incomingAvatar").textContent =
      getInitials(name);
  }

  if ($("incomingStatus")) {
    $("incomingStatus").textContent =
      "Incoming voice call";
  }


  show(
    $("incomingOverlay")
  );


  startRingtone();


  sendBrowserNotification(
    "Incoming Voice Call",
    `${name} is calling you.`
  );
}


// ============================================================
// 40. ACTIVE CALL UI
// ============================================================

function showActiveCall() {

  const name =
    currentRemoteUser?.name ||
    currentRemoteUser?.email ||
    "User";


  if ($("activeName")) {
    $("activeName").textContent =
      name;
  }

  if ($("activeAvatar")) {
    $("activeAvatar").textContent =
      getInitials(name);
  }

  if ($("callStatus")) {
    $("callStatus").textContent =
      "Connected";
  }


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
// 41. HIDE ALL CALL OVERLAYS
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
// 42. CLEANUP
// ============================================================

async function cleanupCall(
  updateDatabase = false
) {

  const callId =
    currentCallId;


  // -----------------------------------------
  // DATABASE
  // -----------------------------------------

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
            now()
        }
      );

    } catch (error) {

      console.error(
        "CLEANUP DATABASE ERROR:",
        error
      );
    }
  }


  // -----------------------------------------
  // TIMEOUT
  // -----------------------------------------

  clearOutgoingTimeout();


  // -----------------------------------------
  // RINGTONE
  // -----------------------------------------

  stopRingtone();


  // -----------------------------------------
  // TIMER
  // -----------------------------------------

  stopCallTimer();


  // -----------------------------------------
  // CALL LISTENER
  // -----------------------------------------

  if (currentCallUnsubscribe) {

    try {
      currentCallUnsubscribe();
    } catch (_) {}

    currentCallUnsubscribe =
      null;
  }


  // -----------------------------------------
  // ICE LISTENER
  // -----------------------------------------

  if (currentCandidateUnsubscribe) {

    try {
      currentCandidateUnsubscribe();
    } catch (_) {}

    currentCandidateUnsubscribe =
      null;
  }


  // -----------------------------------------
  // LOCAL AUDIO
  // -----------------------------------------

  if (localStream) {

    localStream
      .getTracks()
      .forEach(
        (track) => {

          try {
            track.stop();
          } catch (_) {}
        }
      );

    localStream =
      null;
  }


  // -----------------------------------------
  // PEER CONNECTION
  // -----------------------------------------

  if (peerConnection) {

    try {
      peerConnection.close();
    } catch (_) {}

    peerConnection =
      null;
  }


  // -----------------------------------------
  // AUDIO
  // -----------------------------------------

  const audio =
    $("remoteAudio");

  if (audio) {

    audio.srcObject =
      null;

    audio.muted =
      false;
  }


  // -----------------------------------------
  // STATE
  // -----------------------------------------

  currentCallId =
    null;

  currentCallRole =
    null;

  currentRemoteUser =
    null;

  pendingIncomingCall =
    null;

  callStartTime =
    null;

  isMuted =
    false;

  isSpeakerOn =
    true;


  // -----------------------------------------
  // BUTTONS
  // -----------------------------------------

  if ($("muteBtn")) {

    $("muteBtn").textContent =
      "🎤 Mute";
  }

  if ($("speakerBtn")) {

    $("speakerBtn").textContent =
      "🔊 Speaker";
  }


  // -----------------------------------------
  // UI
  // -----------------------------------------

  hideAllCallOverlays();


  // -----------------------------------------
  // REFRESH USERS
  // -----------------------------------------

  if (currentUser) {

    setTimeout(
      () => {
        startUsersListener();
      },
      100
    );
  }
}


// ============================================================
// 43. STOP ALL LISTENERS
// ============================================================

function stopAllListeners() {

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


  if (incomingCallsUnsubscribe) {

    try {
      incomingCallsUnsubscribe();
    } catch (_) {}

    incomingCallsUnsubscribe =
      null;
  }


  if (currentCallUnsubscribe) {

    try {
      currentCallUnsubscribe();
    } catch (_) {}

    currentCallUnsubscribe =
      null;
  }


  if (currentCandidateUnsubscribe) {

    try {
      currentCandidateUnsubscribe();
    } catch (_) {}

    currentCandidateUnsubscribe =
      null;
  }


  clearOutgoingTimeout();

  callsListenerStarted =
    false;

  processedIncomingCalls.clear();
}


// ============================================================
// 44. REFRESH HISTORY
// ============================================================

$("refreshHistoryBtn")?.addEventListener(
  "click",
  () => {
    startHistoryListener();
  }
);


// ============================================================
// 45. NOTIFICATIONS
// ============================================================

async function requestNotifications() {

  if (
    !("Notification" in window)
  ) {

    alert(
      "This browser does not support notifications."
    );

    return;
  }


  if (
    Notification.permission ===
    "denied"
  ) {

    alert(
      "Notifications are blocked. Please click the lock/settings icon next to the website address and allow notifications."
    );

    updateNotificationButton();

    return;
  }


  try {

    const permission =
      await Notification.requestPermission();


    if (
      permission ===
      "granted"
    ) {

      if ($("notificationBtn")) {

        $("notificationBtn").textContent =
          "🔔 Notifications Enabled";
      }


      sendBrowserNotification(
        "VoiceChat",
        "Notifications are now enabled."
      );
    }

    else if (
      permission ===
      "denied"
    ) {

      alert(
        "Notifications were denied. Allow them in your browser's site settings."
      );
    }

  } catch (error) {

    console.error(
      "NOTIFICATION ERROR:",
      error
    );
  }
}


function sendBrowserNotification(
  title,
  body
) {

  if (
    !("Notification" in window)
  ) {
    return;
  }

  if (
    Notification.permission !==
    "granted"
  ) {
    return;
  }


  try {

    new Notification(
      title,
      {
        body:
          body,

        icon:
          "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📞</text></svg>"
      }
    );

  } catch (error) {

    console.warn(
      "Could not create notification:",
      error
    );
  }
}


// ============================================================
// 46. NOTIFICATION STATE
// ============================================================

function updateNotificationButton() {

  const button =
    $("notificationBtn");

  if (!button) {
    return;
  }


  if (
    !("Notification" in window)
  ) {

    button.textContent =
      "🔕 Notifications Unsupported";

    return;
  }


  if (
    Notification.permission ===
    "granted"
  ) {

    button.textContent =
      "🔔 Notifications Enabled";
  }

  else if (
    Notification.permission ===
    "denied"
  ) {

    button.textContent =
      "🔕 Notifications Blocked";
  }

  else {

    button.textContent =
      "🔔 Enable Notifications";
  }
}


// ============================================================
// 47. PAGE VISIBILITY
// ============================================================

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.visibilityState ===
      "visible"
    ) {

      updateNotificationButton();
    }
  }
);


// ============================================================
// 48. PAGE CLOSE
// ============================================================

window.addEventListener(
  "beforeunload",
  () => {

    stopRingtone();

    stopCallTimer();

    clearOutgoingTimeout();


    if (localStream) {

      localStream
        .getTracks()
        .forEach(
          (track) => {

            try {
              track.stop();
            } catch (_) {}
          }
        );
    }


    if (peerConnection) {

      try {
        peerConnection.close();
      } catch (_) {}
    }
  }
);


// ============================================================
// 49. STARTUP
// ============================================================

updateNotificationButton();

console.log(
  "✅ VoiceChat loaded successfully."
);
