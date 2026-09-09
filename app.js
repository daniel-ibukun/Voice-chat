// ============================================================
// VOICECHAT
// Complete Firebase + WebRTC Voice Calling Application
// ============================================================


// ============================================================
// 1. FIREBASE IMPORTS
// ============================================================

import {
  initializeApp
} from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  onChildAdded
} from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";


// ============================================================
// 2. FIREBASE CONFIG
// ============================================================
//
// REPLACE ONLY THESE VALUES WITH YOUR FIREBASE VALUES.
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

const firebaseApp =
  initializeApp(firebaseConfig);

const auth =
  getAuth(firebaseApp);

const db =
  getDatabase(firebaseApp);


// ============================================================
// 4. HELPER
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
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

  return (
    parts
      .map(part =>
        part.charAt(0).toUpperCase()
      )
      .join("")
    || "U"
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

  const total =
    Math.max(
      0,
      Number(seconds) || 0
    );

  const minutes =
    Math.floor(total / 60);

  const remaining =
    total % 60;

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
// 5. STATE
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

let isMuted = false;

let isSpeakerOn = true;

let usersUnsubscribe = null;

let historyUnsubscribe = null;

let currentCallUnsubscribe = null;

let currentCandidateUnsubscribe = null;

let incomingCallsUnsubscribe = null;

let callsListenerStarted = false;

let callFinishing = false;


// ============================================================
// 6. WEBRTC
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
// 7. RINGTONE
// ============================================================

const ringtone =
  $("ringtone");


function startRingtone() {

  if (!ringtone) {
    return;
  }

  ringtone.currentTime = 0;

  ringtone.loop = true;

  ringtone.play()
    .catch(error => {

      console.warn(
        "Ringtone autoplay blocked:",
        error
      );

    });

}


function stopRingtone() {

  if (!ringtone) {
    return;
  }

  ringtone.pause();

  ringtone.currentTime = 0;

}


// ============================================================
// 8. AUTH BUTTONS
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
// 9. REGISTER
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
// 10. LOGIN
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
// 11. LOGOUT
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
// 12. AUTH ERRORS
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
// 13. AUTH STATE
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
        user.email || "User";

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

      hideAllCallOverlays();

    }

  }
);


// ============================================================
// 14. USER PROFILE
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
// 15. USERS LISTENER
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
      snapshot => {

        renderUsers(
          snapshot.val() || {}
        );

      },
      error => {

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
// 16. RENDER USERS
// ============================================================

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
      `
      <p class="empty">
        No other users yet.
      </p>
      `;

    return;
  }

  container.innerHTML =
    list
      .map(user => {

        const name =
          user.name ||
          user.email ||
          "User";

        const onlineText =
          user.online
            ? "🟢 Online"
            : "⚫ Offline";

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

            startOutgoingCall(
              user
            );

          }

        }
      );

    });

}


// ============================================================
// 17. START OUTGOING CALL
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
      .forEach(track => {

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
          now()

      }
    );

    // -----------------------------------------
    // SHOW CALLING
    // -----------------------------------------

    showOutgoingCall(
      remoteUser
    );

    startRingtone();

    // -----------------------------------------
    // LISTEN FOR ANSWER
    // -----------------------------------------

    listenToCurrentCall();

  } catch (error) {

    console.error(
      "START CALL ERROR:",
      error
    );

    alert(
      "Could not start the call. Please allow microphone access."
    );

    await cleanupCall(
      false
    );

  }

}


// ============================================================
// 18. CREATE PEER CONNECTION
// ============================================================

function createPeerConnection() {

  const pc =
    new RTCPeerConnection(
      rtcConfig
    );

  // -----------------------------------------
  // LOCAL ICE CANDIDATES
  // -----------------------------------------

  pc.onicecandidate =
    async event => {

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
    event => {

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
        "WEBRTC:",
        state
      );

      // ---------------------------------------
      // CONNECTED
      // ---------------------------------------

      if (
        state ===
        "connected"
      ) {

        stopRingtone();

        showActiveCall();

        if (!callStartTime) {

          callStartTime =
            now();

        }

        beginCallTimer();

        // Make absolutely sure the caller's
        // database status becomes connected.
        if (
          currentCallId
        ) {

          try {

            await update(
              ref(
                db,
                `calls/${currentCallId}`
              ),
              {

                status:
                  "connected",

                connectedAt:
                  now()

              }
            );

          } catch (error) {

            console.warn(
              "Could not update connected status:",
              error
            );

          }

        }

      }


      // ---------------------------------------
      // FAILED
      // ---------------------------------------

      if (
        state ===
        "failed"
      ) {

        console.warn(
          "WebRTC connection failed."
        );

      }


      // ---------------------------------------
      // DISCONNECTED
      // ---------------------------------------

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
// 19. INCOMING CALL LISTENER
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
      snapshot => {

        const call =
          snapshot.val();

        if (!call) {
          return;
        }

        // Must be the receiver
        if (
          call.calleeId !==
          currentUser.uid
        ) {
          return;
        }

        // Only ringing calls
        if (
          call.status !==
          "ringing"
        ) {
          return;
        }

        // Ignore very old calls
        if (call.createdAt) {

          const age =
            now() -
            Number(
              call.createdAt
            );

          if (age > 60000) {
            return;
          }

        }

        // Already busy
        if (currentCallId) {
          return;
        }

        // Avoid duplicate popup
        if (
          pendingIncomingCall?.callId ===
          call.callId
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
// 20. LISTEN TO CURRENT CALL
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
  // CALL STATUS / ANSWER
  // -----------------------------------------

  currentCallUnsubscribe =
    onValue(
      callRef,
      async snapshot => {

        const call =
          snapshot.val();

        if (!call) {
          return;
        }


        // =====================================
        // CALLER GETS ANSWER
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

            // Very important:
            // once answer exists, the call is no
            // longer just "Calling".
            stopRingtone();

            $("outgoingStatus").textContent =
              "Connecting...";

            await addStoredCandidates();

          } catch (error) {

            console.error(
              "SET ANSWER ERROR:",
              error
            );

          }

        }


        // =====================================
        // CALLER STATUS CONNECTED
        // =====================================

        if (
          currentCallRole ===
          "caller" &&
          call.status ===
          "connected"
        ) {

          stopRingtone();

          $("outgoingStatus").textContent =
            "Connected";

          showActiveCall();

          if (!callStartTime) {

            callStartTime =
              now();

            beginCallTimer();

          }

        }


        // =====================================
        // MISSED CALL
        // =====================================

        if (
          call.status ===
          "missed"
        ) {

          stopRingtone();

          await cleanupCall(
            false
          );

        }


        // =====================================
        // REJECTED
        // =====================================

        if (
          call.status ===
          "rejected"
        ) {

          stopRingtone();

          await cleanupCall(
            false
          );

        }


        // =====================================
        // ENDED
        // =====================================

        if (
          call.status ===
          "ended"
        ) {

          stopRingtone();

          await cleanupCall(
            false
          );

        }

      }
    );


  // -----------------------------------------
  // LIVE ICE CANDIDATES
  // -----------------------------------------

  const candidatesRef =
    ref(
      db,
      `calls/${callId}/candidates`
    );

  currentCandidateUnsubscribe =
    onChildAdded(
      candidatesRef,
      async snapshot => {

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
          of Object.keys(candidates)
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
// 21. ACCEPT INCOMING CALL
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
          call.callerEmail || ""

      };


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
      .forEach(track => {

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
        call.offer
      )
    );


    // -----------------------------------------
    // ANSWER
    // -----------------------------------------

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );


    // -----------------------------------------
    // UPDATE CALL
    // -----------------------------------------

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
          now()

      }
    );


    // -----------------------------------------
    // UI
    // -----------------------------------------

    hide(
      $("incomingOverlay")
    );

    showActiveCall();

    callStartTime =
      now();

    beginCallTimer();

    pendingIncomingCall =
      null;


    // -----------------------------------------
    // LISTEN
    // -----------------------------------------

    listenToCurrentCall();

    await addStoredCandidates();

  } catch (error) {

    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    alert(
      "Could not accept the call. Please make sure microphone permission is allowed."
    );

    await rejectIncomingCallById(
      call.callId
    );

    await cleanupCall(
      false
    );

  }

}


// ============================================================
// 22. REJECT INCOMING CALL
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
        call.callerEmail || "",

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

    await update(
      ref(
        db,
        `calls/${callId}`
      ),
      {

        status:
          "rejected",

        endedAt:
          now()

      }
    );

  } catch (error) {

    console.error(
      "REJECT CALL ERROR:",
      error
    );

  }

}


// ============================================================
// 23. CANCEL OUTGOING CALL
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


    // =========================================
    // STILL RINGING = MISSED CALL
    // =========================================

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
            now()

        }
      );


      // ---------------------------------------
      // RECEIVER GETS MISSED CALL
      // ---------------------------------------

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
            call.callerEmail || "",

          status:
            "missed",

          duration:
            0,

          timestamp:
            now()

        }
      );


      // ---------------------------------------
      // CALLER GETS CANCELLED
      // ---------------------------------------

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
            call.calleeEmail || "",

          status:
            "cancelled",

          duration:
            0,

          timestamp:
            now()

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
            now()

        }
      );

    }

  } catch (error) {

    console.error(
      "CANCEL ERROR:",
      error
    );

  }

  await cleanupCall(
    false
  );

}


// ============================================================
// 24. END ACTIVE CALL
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
// 25. CALL TIMER
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
// 26. MUTE
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
// 27. SPEAKER
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

    if (isSpeakerOn) {

      audio.play()
        .catch(() => {});

    }

  }
);


// ============================================================
// 28. ADD STORED ICE CANDIDATES
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
      of Object.keys(allCandidates)
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
        of Object.keys(candidates || {})
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
// 29. HISTORY LISTENER
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
// 30. RENDER HISTORY
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
// 31. SAVE HISTORY
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
// 32. CURRENT USER NAME
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
// 33. OUTGOING UI
// ============================================================

function showOutgoingCall(user) {

  const name =
    user.name ||
    user.email ||
    "User";

  $("outgoingName").textContent =
    name;

  $("outgoingStatus").textContent =
    "Calling...";

  $("outgoingAvatar").textContent =
    getInitials(name);

  show(
    $("outgoingOverlay")
  );

}


// ============================================================
// 34. INCOMING UI
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

  startRingtone();

  sendBrowserNotification(
    "Incoming Voice Call",
    `${name} is calling you.`
  );

}


// ============================================================
// 35. ACTIVE CALL UI
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
// 36. HIDE CALL OVERLAYS
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
// 37. CLEANUP
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
      .forEach(track => {

        try {

          track.stop();

        } catch (_) {}

      });

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

}


// ============================================================
// 38. STOP ALL LISTENERS
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


  callsListenerStarted =
    false;

}


// ============================================================
// 39. REFRESH HISTORY
// ============================================================

$("refreshHistoryBtn")?.addEventListener(
  "click",
  () => {

    startHistoryListener();

  }
);


// ============================================================
// 40. NOTIFICATIONS
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

  try {

    const permission =
      await Notification.requestPermission();

    if (
      permission ===
      "granted"
    ) {

      $("notificationBtn").textContent =
        "🔔 Notifications Enabled";

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
        "Notifications were denied. You need to allow notifications in your browser settings."
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
// 41. CHECK NOTIFICATION STATE
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
// 42. PAGE VISIBILITY
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
// 43. PAGE CLOSE
// ============================================================

window.addEventListener(
  "beforeunload",
  () => {

    stopRingtone();

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
// 44. STARTUP
// ============================================================

updateNotificationButton();

console.log(
  "✅ VoiceChat loaded successfully."
);
