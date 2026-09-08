// ============================================================
// VOICECHAT - CLEAN APP.JS
// Firebase + WebRTC Voice Calling
// ============================================================

import { initializeApp } from
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
// 1. FIREBASE CONFIG
// ============================================================
// IMPORTANT:
// Replace ONLY the values below with your Firebase project data.
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);


// ============================================================
// 3. HELPER FUNCTIONS
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
    .slice(0, 2);

  return (
    parts
      .map(part => part.charAt(0).toUpperCase())
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
  seconds = Math.max(0, Number(seconds) || 0);

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remaining).padStart(2, "0")
  );
}


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


function showAuthMessage(message) {
  const element = $("authMessage");

  if (element) {
    element.textContent = message;
  }
}


function friendlyAuthError(error) {
  const code = error?.code || "";

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
      return error?.message || "Authentication failed.";
  }
}


// ============================================================
// 4. APPLICATION STATE
// ============================================================

let currentUser = null;

let usersUnsubscribe = null;
let historyUnsubscribe = null;

let callsListenerStarted = false;
let incomingCallsUnsubscribe = null;

let callUnsubscribers = [];

let currentCallId = null;
let currentCallRole = null;

let currentRemoteUser = null;

let peerConnection = null;
let localStream = null;

let pendingIncomingCall = null;

let callStartTime = null;
let callTimerInterval = null;

let isMuted = false;
let isSpeakerOn = true;


// ============================================================
// 5. WEBRTC CONFIGURATION
// ============================================================

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ]
};


// ============================================================
// 6. AUTH BUTTONS
// ============================================================

$("loginBtn")?.addEventListener("click", login);
$("registerBtn")?.addEventListener("click", register);
$("logoutBtn")?.addEventListener("click", logout);


// ============================================================
// 7. REGISTER
// ============================================================

async function register() {
  const email = $("emailInput")?.value.trim();
  const password = $("passwordInput")?.value;

  if (!email || !password) {
    showAuthMessage("Enter an email and password.");
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
      ref(db, `users/${result.user.uid}`),
      {
        uid: result.user.uid,
        email: email,
        name: email.split("@")[0],
        createdAt: Date.now(),
        online: true,
        lastSeen: Date.now()
      }
    );

    showAuthMessage("Account created.");
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    showAuthMessage(friendlyAuthError(error));
  }
}


// ============================================================
// 8. LOGIN
// ============================================================

async function login() {
  const email = $("emailInput")?.value.trim();
  const password = $("passwordInput")?.value;

  if (!email || !password) {
    showAuthMessage("Enter your email and password.");
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
    console.error("LOGIN ERROR:", error);
    showAuthMessage(friendlyAuthError(error));
  }
}


// ============================================================
// 9. LOGOUT
// ============================================================

async function logout() {
  try {
    await cleanupCall(false);

    if (currentUser) {
      await update(
        ref(db, `users/${currentUser.uid}`),
        {
          online: false,
          lastSeen: Date.now()
        }
      );
    }

    await signOut(auth);
  } catch (error) {
    console.error("LOGOUT ERROR:", error);
  }
}


// ============================================================
// 10. AUTH STATE
// ============================================================

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    show($("appScreen"));
    hide($("authScreen"));

    if ($("currentUserText")) {
      $("currentUserText").textContent =
        user.email || "";
    }

    try {
      await ensureUserProfile();
    } catch (error) {
      console.error(
        "PROFILE ERROR:",
        error
      );
    }

    startUsersListener();
    startHistoryListener();
    startIncomingCallListener();

  } else {
    currentUser = null;

    hide($("appScreen"));
    show($("authScreen"));

    stopListeners();
    hideAllCallOverlays();
  }
});


// ============================================================
// 11. USER PROFILE
// ============================================================

async function ensureUserProfile() {
  if (!currentUser) {
    return;
  }

  const userRef =
    ref(db, `users/${currentUser.uid}`);

  const snapshot =
    await get(userRef);

  const oldData =
    snapshot.exists()
      ? snapshot.val()
      : {};

  await update(
    userRef,
    {
      uid: currentUser.uid,

      email:
        currentUser.email || "",

      name:
        oldData.name ||
        currentUser.email?.split("@")[0] ||
        "User",

      online: true,

      lastSeen: Date.now()
    }
  );
}


// ============================================================
// 12. USERS LISTENER
// ============================================================

function startUsersListener() {
  if (usersUnsubscribe) {
    usersUnsubscribe();
    usersUnsubscribe = null;
  }

  if (!currentUser) {
    return;
  }

  const usersRef = ref(db, "users");

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

        if ($("usersList")) {
          $("usersList").innerHTML =
            `<p class="empty">
              Unable to load users.
            </p>`;
        }
      }
    );
}


// ============================================================
// 13. RENDER USERS
// ============================================================

function renderUsers(users) {
  const container = $("usersList");

  if (!container || !currentUser) {
    return;
  }

  const list =
    Object.values(users)
      .filter(user =>
        user &&
        user.uid &&
        user.uid !== currentUser.uid
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

            <div class="user-status">
              ${user.online ? "🟢 Online" : "⚪ Offline"}
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
    .querySelectorAll("[data-call-user]")
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
// 14. START OUTGOING CALL
// ============================================================

async function startOutgoingCall(remoteUser) {
  if (!currentUser || !remoteUser) {
    return;
  }

  if (currentCallId) {
    alert(
      "You are already in a call."
    );
    return;
  }

  try {
    currentRemoteUser = remoteUser;
    currentCallRole = "caller";

    showOutgoingCall(remoteUser);

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });

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
      push(ref(db, "calls"));

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
        callId: currentCallId,

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
          type: offer.type,
          sdp: offer.sdp
        },

        status: "ringing",

        createdAt: Date.now()
      }
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
// 15. CREATE PEER CONNECTION
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


  pc.onconnectionstatechange =
    () => {
      const state =
        pc.connectionState;

      console.log(
        "WEBRTC STATE:",
        state
      );

      // ======================================================
      // THIS FIXES THE "CALLING..." PROBLEM
      // ======================================================

      if (state === "connected") {

        if (!callStartTime) {
          callStartTime =
            Date.now();
        }

        beginCallTimer();

        // Make caller UI say CONNECTED.
        showActiveCall();

        if ($("outgoingStatus")) {
          $("outgoingStatus").textContent =
            "Connected";
        }

        if ($("callStatus")) {
          $("callStatus").textContent =
            "Connected";
        }
      }


      if (
        state === "failed" ||
        state === "disconnected"
      ) {
        console.warn(
          "WebRTC connection problem:",
          state
        );
      }


      if (state === "closed") {
        stopCallTimer();
      }
    };


  return pc;
}


// ============================================================
// 16. INCOMING CALL LISTENER
// ============================================================

function startIncomingCallListener() {
  if (
    callsListenerStarted ||
    !currentUser
  ) {
    return;
  }

  callsListenerStarted = true;

  const callsRef =
    ref(db, "calls");

  incomingCallsUnsubscribe =
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

        if (
          currentCallId
        ) {
          return;
        }

        if (pendingIncomingCall) {
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

        showIncomingCall(call);
      }
    );
}


// ============================================================
// 17. LISTEN TO CURRENT CALL
// ============================================================

function listenToCurrentCall() {
  if (!currentCallId) {
    return;
  }

  const callId =
    currentCallId;

  const callRef =
    ref(
      db,
      `calls/${callId}`
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


        // ====================================================
        // CALLER RECEIVES ANSWER
        // ====================================================

        if (
          currentCallRole === "caller" &&
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


        // ====================================================
        // IMPORTANT:
        // FIREBASE SAYS CONNECTED
        // ====================================================

        if (
          call.status === "connected" &&
          currentCallRole === "caller"
        ) {

          showActiveCall();

          if ($("outgoingStatus")) {
            $("outgoingStatus").textContent =
              "Connected";
          }

          if (!callStartTime) {
            callStartTime =
              Number(
                call.answeredAt
              ) || Date.now();
          }

          beginCallTimer();
        }


        // ====================================================
        // MISSED CALL
        // ====================================================

        if (
          call.status === "missed"
        ) {

          if (
            currentCallRole === "caller"
          ) {
            hideAllCallOverlays();
          }

          await cleanupCall(false);
          return;
        }


        // ====================================================
        // REJECTED
        // ====================================================

        if (
          call.status === "rejected"
        ) {

          if (
            currentCallRole === "caller"
          ) {

            if ($("outgoingStatus")) {
              $("outgoingStatus").textContent =
                "Call rejected";
            }

            setTimeout(
              () => {
                cleanupCall(false);
              },
              1000
            );
          }

          return;
        }


        // ====================================================
        // CANCELLED
        // ====================================================

        if (
          call.status === "cancelled"
        ) {
          await cleanupCall(false);
          return;
        }


        // ====================================================
        // ENDED
        // ====================================================

        if (
          call.status === "ended"
        ) {

          await cleanupCall(false);
          return;
        }
      }
    );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ============================================================
// 18. ACCEPT INCOMING CALL
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
      uid: call.callerId,

      name:
        call.callerName ||
        call.callerEmail ||
        "User",

      email:
        call.callerEmail || ""
    };


    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });


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
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },

        status: "connected",

        answeredAt:
          Date.now()
      }
    );


    pendingIncomingCall =
      null;


    hide(
      $("incomingOverlay")
    );


    showActiveCall();


    callStartTime =
      Date.now();

    beginCallTimer();


    await addStoredCandidates();


    listenToCurrentCall();

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
// 19. REJECT INCOMING CALL
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
        status: "rejected",
        endedAt: Date.now()
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

        duration: 0,

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
// 20. CANCEL OUTGOING CALL
// ============================================================

$("cancelCallBtn")?.addEventListener(
  "click",
  cancelOutgoingCall
);


async function cancelOutgoingCall() {

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


    // ========================================================
    // CALLER CANCELS BEFORE PERSON ANSWERS
    // ========================================================

    if (
      call &&
      call.status === "ringing"
    ) {

      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {
          status: "missed",
          endedAt: Date.now()
        }
      );


      // The person being called gets MISSED CALL.
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

          duration: 0,

          timestamp:
            Date.now()
        }
      );


      // Caller gets CANCELLED.
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

          duration: 0,

          timestamp:
            Date.now()
        }
      );


    } else {

      // ======================================================
      // CALL WAS ALREADY ANSWERED
      // ======================================================

      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {
          status: "ended",
          endedAt: Date.now()
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
// 21. END ACTIVE CALL
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


  const duration =
    getCallDuration();


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
        status: "ended",
        endedAt: Date.now()
      }
    );


    if (call) {

      // Save history for current user.
      await saveHistoryForUser(
        currentUser.uid,
        callId,
        {
          remoteUid:
            currentRemoteUser?.uid || "",

          remoteName:
            currentRemoteUser?.name ||
            currentRemoteUser?.email ||
            "User",

          remoteEmail:
            currentRemoteUser?.email ||
            "",

          status: "ended",

          duration,

          timestamp:
            Date.now()
        }
      );


      // Save history for the other person too.
      const otherUserId =
        currentUser.uid === call.callerId
          ? call.calleeId
          : call.callerId;


      const otherName =
        currentUser.uid === call.callerId
          ? (
              call.callerName ||
              call.callerEmail ||
              "User"
            )
          : (
              call.calleeName ||
              call.calleeEmail ||
              "User"
            );


      const otherEmail =
        currentUser.uid === call.callerId
          ? (
              call.callerEmail || ""
            )
          : (
              call.calleeEmail || ""
            );


      await saveHistoryForUser(
        otherUserId,
        callId,
        {
          remoteUid:
            currentUser.uid,

          remoteName:
            getCurrentUserName(),

          remoteEmail:
            currentUser.email || "",

          status: "ended",

          duration,

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
// 22. CALL TIMER
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

  const timer =
    $("callTimer");

  if (!timer) {
    return;
  }


  if (!callStartTime) {
    timer.textContent =
      "00:00";

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
// 23. MUTE
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


    if ($("muteBtn")) {
      $("muteBtn").textContent =
        isMuted
          ? "🔇 Unmute"
          : "🎤 Mute";
    }
  }
);


// ============================================================
// 24. SPEAKER
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
  }
);


// ============================================================
// 25. ADD STORED ICE CANDIDATES
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
// 26. HISTORY LISTENER
// ============================================================

function startHistoryListener() {

  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
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
            `<p class="empty">
              Unable to load call history.
            </p>`;
        }
      }
    );
}


// ============================================================
// 27. RENDER HISTORY
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
          status === "missed"
        ) {

          statusText =
            "📵 Missed Call";

          statusClass =
            "missed";

        } else if (
          status === "cancelled"
        ) {

          statusText =
            "↩️ Cancelled";

          statusClass =
            "rejected";

        } else if (
          status === "rejected"
        ) {

          statusText =
            "❌ Rejected";

          statusClass =
            "rejected";
        }


        const date =
          item.timestamp
            ? new Date(
                Number(item.timestamp)
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
// 28. SAVE HISTORY
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
// 29. OUTGOING CALL UI
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

  hide(
    $("activeCallOverlay")
  );

  hide(
    $("incomingOverlay")
  );
}


// ============================================================
// 30. INCOMING CALL UI
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


  show(
    $("incomingOverlay")
  );
}


// ============================================================
// 31. ACTIVE CALL UI
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
// 32. HIDE ALL CALL WINDOWS
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
// 33. CLEANUP CALL
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
          status: "ended",
          endedAt: Date.now()
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


  callUnsubscribers = [];


  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => {

        try {
          track.stop();
        } catch (_) {}

      });

    localStream = null;
  }


  if (peerConnection) {

    try {
      peerConnection.close();
    } catch (_) {}

    peerConnection = null;
  }


  const audio =
    $("remoteAudio");


  if (audio) {

    audio.srcObject = null;
    audio.muted = false;
  }


  currentCallId = null;
  currentCallRole = null;
  currentRemoteUser = null;

  pendingIncomingCall = null;

  callStartTime = null;

  isMuted = false;
  isSpeakerOn = true;


  if ($("muteBtn")) {
    $("muteBtn").textContent =
      "🎤 Mute";
  }


  if ($("speakerBtn")) {
    $("speakerBtn").textContent =
      "🔊 Speaker";
  }


  hideAllCallOverlays();
}


// ============================================================
// 34. STOP LISTENERS
// ============================================================

function stopListeners() {

  if (usersUnsubscribe) {

    try {
      usersUnsubscribe();
    } catch (_) {}

    usersUnsubscribe = null;
  }


  if (historyUnsubscribe) {

    try {
      historyUnsubscribe();
    } catch (_) {}

    historyUnsubscribe = null;
  }


  if (incomingCallsUnsubscribe) {

    try {
      incomingCallsUnsubscribe();
    } catch (_) {}

    incomingCallsUnsubscribe = null;
  }


  callUnsubscribers
    .forEach(
      unsubscribe => {

        try {
          unsubscribe();
        } catch (_) {}

      }
    );


  callUnsubscribers = [];

  callsListenerStarted = false;
}


// ============================================================
// 35. REFRESH HISTORY
// ============================================================

$("refreshHistoryBtn")?.addEventListener(
  "click",
  () => {
    startHistoryListener();
  }
);


// ============================================================
// 36. PAGE CLOSE
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
// 37. STARTUP
// ============================================================

console.log(
  "✅ VoiceChat app.js loaded successfully."
);
