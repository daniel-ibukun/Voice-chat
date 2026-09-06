import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  onChildAdded,
  onChildChanged,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";


// ======================================================
// FIREBASE CONFIG
// ======================================================

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "voice-chat01-63e85.firebaseapp.com",
  databaseURL: "https://voice-chat01-63e85-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "voice-chat01-63e85",
  storageBucket: "voice-chat01-63e85.firebasestorage.app",
  messagingSenderId: "113293901393",
  appId: "1:113293901393:web:bfbca6f5da36368e274270"
};


// ======================================================
// FIREBASE START
// ======================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);


// ======================================================
// GLOBAL VARIABLES
// ======================================================

let currentUser = null;
let currentProfile = null;

let peerConnection = null;
let localStream = null;

let currentCallId = null;
let currentCallRole = null;
let currentRemoteUser = null;

let callStartTime = null;
let callTimerInterval = null;

let usersUnsubscribe = null;
let incomingCallsUnsubscribe = null;
let historyUnsubscribe = null;

let callUnsubscribers = [];

let userCache = {};
let pendingIncomingCall = null;

let pendingRemoteCandidates = [];

let isMuted = false;
let isSpeakerOn = true;

let notificationPermissionAsked = false;

let ringtoneContext = null;
let ringtoneTimer = null;


// ======================================================
// DOM HELPER
// ======================================================

function $(id) {
  return document.getElementById(id);
}


// ======================================================
// HTML ESCAPE
// ======================================================

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ======================================================
// SHOW AUTH / MAIN
// ======================================================

function showScreen(screen) {
  const authSection = $("authSection");
  const mainSection = $("mainSection");

  if (!authSection || !mainSection) return;

  authSection.classList.toggle("hidden", screen !== "auth");
  mainSection.classList.toggle("hidden", screen !== "main");
}


// ======================================================
// AUTH MESSAGE
// ======================================================

function setAuthMessage(message, isError = true) {
  const element = $("authMessage");

  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "red" : "green";
}


function setRegisterMessage(message, isError = true) {
  const element = $("registerMessage");

  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "red" : "green";
}


// ======================================================
// NOTIFICATION
// ======================================================

function showNotification(message) {
  const notification = $("notification");

  if (!notification) return;

  notification.textContent = message;
  notification.classList.remove("hidden");

  setTimeout(() => {
    notification.classList.add("hidden");
  }, 4000);
}


// ======================================================
// AVATAR
// ======================================================

function getAvatarLetter(name) {
  const value = String(name || "U").trim();

  return value.charAt(0).toUpperCase();
}


function makeAvatar(name) {
  const letter = getAvatarLetter(name);

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    letter
  )}&background=4f46e5&color=ffffff&size=128`;
}


// ======================================================
// FORMAT TIME
// ======================================================

function formatDuration(seconds) {
  seconds = Math.max(0, Number(seconds) || 0);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0")
  );
}


function formatDate(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString();
}


// ======================================================
// FRIENDLY FIREBASE AUTH ERRORS
// ======================================================

function friendlyAuthError(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/user-not-found":
      return "No account was found with this email.";

    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/email-already-in-use":
      return "That email is already registered.";

    case "auth/weak-password":
      return "Password should be at least 6 characters.";

    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";

    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";

    default:
      return error?.message || "Something went wrong.";
  }
}


// ======================================================
// LOGIN
// ======================================================

async function login() {
  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    setAuthMessage("Please enter your email and password.");
    return;
  }

  const button = $("loginBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Logging in...";
  }

  setAuthMessage("");

  try {
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    setAuthMessage("Login successful.", false);

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    console.error("ERROR CODE:", error.code);
    console.error("ERROR MESSAGE:", error.message);

    setAuthMessage(friendlyAuthError(error));

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Login";
    }
  }
}


// ======================================================
// REGISTER
// ======================================================

async function register() {
  const name = $("registerName")?.value.trim();
  const email = $("registerEmail")?.value.trim();
  const password = $("registerPassword")?.value;
  const confirmPassword =
    $("registerConfirmPassword")?.value;

  if (!name) {
    setRegisterMessage("Please enter your name.");
    return;
  }

  if (!email) {
    setRegisterMessage("Please enter your email.");
    return;
  }

  if (!password) {
    setRegisterMessage("Please enter a password.");
    return;
  }

  if (password.length < 6) {
    setRegisterMessage(
      "Password must be at least 6 characters."
    );
    return;
  }

  if (password !== confirmPassword) {
    setRegisterMessage("Passwords do not match.");
    return;
  }

  const button = $("registerBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Creating account...";
  }

  setRegisterMessage("");

  try {
    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    const user = credential.user;

    await updateProfile(user, {
      displayName: name
    });

    const profile = {
      uid: user.uid,
      name: name,
      email: user.email || email,
      online: true,
      createdAt: Date.now(),
      lastSeen: Date.now()
    };

    await set(
      ref(db, `users/${user.uid}`),
      profile
    );

    setRegisterMessage(
      "Account created successfully.",
      false
    );

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    console.error("ERROR CODE:", error.code);
    console.error("ERROR MESSAGE:", error.message);

    setRegisterMessage(
      friendlyAuthError(error)
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Create Account";
    }
  }
}


// ======================================================
// LOAD MY PROFILE
// ======================================================

async function loadMyProfile() {
  if (!currentUser) return;

  const profileRef =
    ref(db, `users/${currentUser.uid}`);

  const snapshot = await get(profileRef);

  if (snapshot.exists()) {
    currentProfile = snapshot.val();
    return;
  }

  currentProfile = {
    uid: currentUser.uid,
    name:
      currentUser.displayName ||
      currentUser.email?.split("@")[0] ||
      "User",
    email: currentUser.email || "",
    online: true,
    createdAt: Date.now(),
    lastSeen: Date.now()
  };

  await set(profileRef, currentProfile);
}


// ======================================================
// UPDATE MY UI
// ======================================================

function updateMyUI() {
  if (!currentUser) return;

  const name =
    currentProfile?.name ||
    currentUser.displayName ||
    currentUser.email?.split("@")[0] ||
    "User";

  const welcomeText = $("welcomeText");

  if (welcomeText) {
    welcomeText.textContent = `Welcome, ${name}`;
  }

  const avatar = $("myAvatar");

  if (avatar) {
    avatar.src = makeAvatar(name);
    avatar.alt = name;
  }
}


// ======================================================
// PRESENCE
// ======================================================

async function setupPresence() {
  if (!currentUser) return;

  const userRef =
    ref(db, `users/${currentUser.uid}`);

  await update(userRef, {
    online: true,
    lastSeen: Date.now()
  });

  const disconnectRef = onDisconnect(userRef);

  await disconnectRef.update({
    online: false,
    lastSeen: serverTimestamp()
  });
}


// ======================================================
// LOAD USERS
// ======================================================

function listenForUsers() {
  if (usersUnsubscribe) {
    usersUnsubscribe();
  }

  const usersRef = ref(db, "users");

  usersUnsubscribe = onValue(
    usersRef,
    snapshot => {
      userCache = {};

      if (!snapshot.exists()) {
        renderUsers([]);
        return;
      }

      const data = snapshot.val();

      const users = [];

      Object.entries(data).forEach(
        ([uid, user]) => {

          if (!user) return;

          userCache[uid] = {
            ...user,
            uid
          };

          if (uid === currentUser?.uid) {
            return;
          }

          users.push({
            ...user,
            uid
          });
        }
      );

      users.sort((a, b) => {
        if (a.online && !b.online) return -1;
        if (!a.online && b.online) return 1;

        return String(a.name || "").localeCompare(
          String(b.name || "")
        );
      });

      renderUsers(users);

    },
    error => {
      console.error("USERS ERROR:", error);
      showNotification(
        "Could not load users: " + error.message
      );
    }
  );
}


// ======================================================
// RENDER USERS
// ======================================================

function renderUsers(users) {
  const container = $("usersList");

  if (!container) return;

  if (!users.length) {
    container.innerHTML =
      "<p>No other users found.</p>";
    return;
  }

  container.innerHTML = users.map(user => {

    const name =
      user.name ||
      user.email ||
      "User";

    const email =
      user.email || "";

    const online =
      user.online === true;

    return `
      <div class="user-card">

        <img
          class="user-avatar"
          src="${makeAvatar(name)}"
          alt="${escapeHTML(name)}"
        >

        <div class="user-info">

          <div class="user-details">

            <strong>
              ${escapeHTML(name)}
            </strong>

            <small>
              ${escapeHTML(email)}
            </small>

            <span class="status">

              <span
                class="status-dot ${online ? "online" : ""}"
              ></span>

              ${online ? "Online" : "Offline"}

            </span>

          </div>

          <button
            type="button"
            class="call-user-btn"
            data-uid="${escapeHTML(user.uid)}"
          >
            📞 Call
          </button>

        </div>

      </div>
    `;

  }).join("");

  container
    .querySelectorAll(".call-user-btn")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {
          const uid =
            button.dataset.uid;

          const user =
            userCache[uid];

          if (!user) {
            showNotification(
              "User could not be found."
            );
            return;
          }

          startCall({
            ...user,
            uid
          });
        }
      );

    });
}


// ======================================================
// GET MICROPHONE
// ======================================================

async function getMicrophone() {
  if (!navigator.mediaDevices) {
    throw new Error(
      "Your browser does not support microphone access."
    );
  }

  return await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false
  });
}


// ======================================================
// CREATE WEBRTC CONNECTION
// ======================================================

function createPeerConnection(role, callId) {

  const connection =
    new RTCPeerConnection({
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
    });

  if (localStream) {
    localStream
      .getTracks()
      .forEach(track => {
        connection.addTrack(
          track,
          localStream
        );
      });
  }

  connection.ontrack = event => {

    const remoteAudio =
      $("remoteAudio");

    if (!remoteAudio) return;

    if (
      event.streams &&
      event.streams[0]
    ) {
      remoteAudio.srcObject =
        event.streams[0];

      remoteAudio.play().catch(() => {});
    }
  };


  connection.onicecandidate =
    async event => {

      if (!event.candidate) return;

      try {

        const candidateRef = push(
          ref(
            db,
            `calls/${callId}/${
              role === "caller"
                ? "callerCandidates"
                : "calleeCandidates"
            }`
          )
        );

        await set(
          candidateRef,
          event.candidate.toJSON()
        );

      } catch (error) {

        console.error(
          "ICE CANDIDATE ERROR:",
          error
        );

      }
    };


  connection.onconnectionstatechange =
    () => {

      console.log(
        "WebRTC state:",
        connection.connectionState
      );

      if (
        connection.connectionState ===
        "connected"
      ) {
        $("callStatus").textContent =
          "Connected";

        startCallTimer();
      }

      if (
        connection.connectionState ===
        "failed"
      ) {
        $("callStatus").textContent =
          "Connection failed";

        showNotification(
          "Call connection failed."
        );
      }

      if (
        connection.connectionState ===
        "disconnected"
      ) {
        $("callStatus").textContent =
          "Disconnected";
      }
    };


  return connection;
}


// ======================================================
// ICE CANDIDATE HANDLING
// ======================================================

async function addRemoteCandidate(candidate) {

  if (!candidate) return;

  if (
    !peerConnection ||
    !peerConnection.remoteDescription
  ) {
    pendingRemoteCandidates.push(candidate);
    return;
  }

  try {

    await peerConnection.addIceCandidate(
      new RTCIceCandidate(candidate)
    );

  } catch (error) {

    console.error(
      "ADD ICE ERROR:",
      error
    );

  }
}


async function flushRemoteCandidates() {

  if (
    !peerConnection ||
    !peerConnection.remoteDescription
  ) {
    return;
  }

  const candidates =
    pendingRemoteCandidates;

  pendingRemoteCandidates = [];

  for (const candidate of candidates) {

    try {

      await peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );

    } catch (error) {

      console.error(
        "FLUSH ICE ERROR:",
        error
      );

    }
  }
}


// ======================================================
// LISTEN FOR ICE CANDIDATES
// ======================================================

function listenForCandidates(
  callId,
  type
) {

  const candidatesRef =
    ref(
      db,
      `calls/${callId}/${type}`
    );

  const unsubscribe = onChildAdded(
    candidatesRef,
    async snapshot => {

      const candidate =
        snapshot.val();

      await addRemoteCandidate(
        candidate
      );
    }
  );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ======================================================
// START CALL
// ======================================================

async function startCall(user) {

  if (!currentUser) {
    showNotification(
      "Please log in first."
    );
    return;
  }

  if (!user?.uid) {
    showNotification(
      "Invalid user."
    );
    return;
  }

  if (user.uid === currentUser.uid) {
    showNotification(
      "You cannot call yourself."
    );
    return;
  }

  if (currentCallId) {
    showNotification(
      "You are already in a call."
    );
    return;
  }

  try {

    showNotification(
      "Requesting microphone..."
    );

    localStream =
      await getMicrophone();

    const callsRef =
      ref(db, "calls");

    const newCallRef =
      push(callsRef);

    currentCallId =
      newCallRef.key;

    currentCallRole =
      "caller";

    currentRemoteUser = user;

    peerConnection =
      createPeerConnection(
        "caller",
        currentCallId
      );

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    const callerName =
      currentProfile?.name ||
      currentUser.displayName ||
      currentUser.email ||
      "User";

    const callData = {

      callerId:
        currentUser.uid,

      calleeId:
        user.uid,

      callerName:
        callerName,

      callerEmail:
        currentUser.email || "",

      calleeName:
        user.name ||
        user.email ||
        "User",

      calleeEmail:
        user.email || "",

      status:
        "ringing",

      offer: {
        type: offer.type,
        sdp: offer.sdp
      },

      createdAt:
        Date.now()

    };

    await set(
      newCallRef,
      callData
    );

    listenForCandidates(
      currentCallId,
      "calleeCandidates"
    );

    listenToOutgoingCall(
      currentCallId
    );

    showOutgoingCall();

    startRingtone();

  } catch (error) {

    console.error(
      "START CALL ERROR:",
      error
    );

    showNotification(
      error.message ||
      "Could not start the call."
    );

    await cleanupCall();

  }
}


// ======================================================
// SHOW OUTGOING CALL
// ======================================================

function showOutgoingCall() {

  const overlay =
    $("outgoingCallOverlay");

  if (!overlay) return;

  const name =
    currentRemoteUser?.name ||
    currentRemoteUser?.email ||
    "User";

  $("outgoingCallerName").textContent =
    name;

  $("outgoingCallerAvatar").src =
    makeAvatar(name);

  $("outgoingCallStatus").textContent =
    "Calling...";

  $("outgoingRinging").textContent =
    "📞 Ringing...";

  overlay.classList.remove(
    "hidden"
  );
}


// ======================================================
// LISTEN TO OUTGOING CALL
// ======================================================

function listenToOutgoingCall(callId) {

  const callRef =
    ref(db, `calls/${callId}`);

  const unsubscribe = onValue(
    callRef,
    async snapshot => {

      if (!snapshot.exists()) {
        return;
      }

      const call =
        snapshot.val();

      if (
        call.answer &&
        peerConnection &&
        !peerConnection.remoteDescription
      ) {

        try {

          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
              call.answer
            )
          );

          await flushRemoteCandidates();

          stopRingtone();

          showActiveCall();

          startCallTimer();

        } catch (error) {

          console.error(
            "SET ANSWER ERROR:",
            error
          );

        }
      }


      if (
        call.status === "rejected" ||
        call.status === "cancelled" ||
        call.status === "ended" ||
        call.status === "missed" ||
        call.status === "failed"
      ) {

        stopRingtone();

        showNotification(
          getCallStatusMessage(
            call.status
          )
        );

        await cleanupCall();

      }

    },
    error => {

      console.error(
        "OUTGOING CALL LISTENER ERROR:",
        error
      );

    }
  );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ======================================================
// INCOMING CALL LISTENER
// ======================================================

function listenForIncomingCalls() {

  if (incomingCallsUnsubscribe) {
    incomingCallsUnsubscribe();
  }

  const callsRef =
    ref(db, "calls");

  incomingCallsUnsubscribe =
    onChildAdded(
      callsRef,
      snapshot => {

        const call =
          snapshot.val();

        if (!call) return;

        if (
          call.calleeId !==
          currentUser?.uid
        ) {
          return;
        }

        if (
          call.status !==
          "ringing"
        ) {
          return;
        }

        if (currentCallId) {
          return;
        }

        showIncomingCall(
          snapshot.key,
          call
        );
      },
      error => {

        console.error(
          "INCOMING CALL ERROR:",
          error
        );

      }
    );
}


// ======================================================
// SHOW INCOMING CALL
// ======================================================

function showIncomingCall(
  callId,
  call
) {

  if (currentCallId) return;

  pendingIncomingCall = {
    id: callId,
    data: call
  };

  const name =
    call.callerName ||
    call.callerEmail ||
    "Unknown caller";

  $("incomingCallerName").textContent =
    name;

  $("incomingCallerEmail").textContent =
    call.callerEmail || "";

  $("incomingCallerAvatar").src =
    makeAvatar(name);

  $("ringingIndicator").textContent =
    "📞 Incoming call...";

  $("incomingCallOverlay")
    .classList.remove("hidden");

  startRingtone();

  sendBrowserNotification(
    "Incoming voice call",
    `${name} is calling you`
  );
}


// ======================================================
// ACCEPT CALL
// ======================================================

async function acceptCall() {

  if (!pendingIncomingCall) {
    return;
  }

  const callId =
    pendingIncomingCall.id;

  const call =
    pendingIncomingCall.data;

  try {

    stopRingtone();

    $("incomingCallOverlay")
      .classList.add("hidden");

    showNotification(
      "Connecting call..."
    );

    localStream =
      await getMicrophone();

    currentCallId =
      callId;

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

    peerConnection =
      createPeerConnection(
        "callee",
        callId
      );

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        call.offer
      )
    );

    await flushRemoteCandidates();

    listenForCandidates(
      callId,
      "callerCandidates"
    );

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );

    await update(
      ref(db, `calls/${callId}`),
      {
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },

        status:
          "accepted",

        startedAt:
          Date.now()
      }
    );

    currentCallRole =
      "callee";

    pendingIncomingCall =
      null;

    showActiveCall();

    startCallTimer();

    listenForActiveCallChanges(
      callId
    );

  } catch (error) {

    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    showNotification(
      error.message ||
      "Could not accept call."
    );

    await cleanupCall();

  }
}


// ======================================================
// LISTEN FOR ACTIVE CALL CHANGES
// ======================================================

function listenForActiveCallChanges(
  callId
) {

  const callRef =
    ref(db, `calls/${callId}`);

  const unsubscribe = onValue(
    callRef,
    async snapshot => {

      if (!snapshot.exists()) {
        return;
      }

      const call =
        snapshot.val();

      if (
        call.status === "cancelled" ||
        call.status === "ended"
      ) {

        showNotification(
          "The call has ended."
        );

        await cleanupCall();

      }

    }
  );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ======================================================
// SHOW ACTIVE CALL
// ======================================================

function showActiveCall() {

  stopRingtone();

  $("outgoingCallOverlay")
    ?.classList.add("hidden");

  $("incomingCallOverlay")
    ?.classList.add("hidden");

  const overlay =
    $("callOverlay");

  if (!overlay) return;

  const name =
    currentRemoteUser?.name ||
    currentRemoteUser?.email ||
    "User";

  $("callName").textContent =
    name;

  $("callAvatar").src =
    makeAvatar(name);

  $("callType").textContent =
    "Voice Call";

  $("callStatus").textContent =
    "Connecting...";

  $("callTimer").textContent =
    "00:00";

  overlay.classList.remove(
    "hidden"
  );
}


// ======================================================
// CALL TIMER
// ======================================================

function startCallTimer() {

  if (callTimerInterval) {
    clearInterval(
      callTimerInterval
    );
  }

  if (!callStartTime) {
    callStartTime = Date.now();
  }

  callTimerInterval =
    setInterval(() => {

      const elapsed =
        Math.floor(
          (Date.now() -
            callStartTime) /
            1000
        );

      const timer =
        $("callTimer");

      if (timer) {
        timer.textContent =
          formatDuration(elapsed);
      }

    }, 1000);
}


// ======================================================
// MUTE
// ======================================================

function toggleMute() {

  if (!localStream) return;

  isMuted = !isMuted;

  localStream
    .getAudioTracks()
    .forEach(track => {
      track.enabled = !isMuted;
    });

  const button =
    $("muteBtn");

  if (button) {
    button.textContent =
      isMuted
        ? "🔇 Unmute"
        : "🎤 Mute";
  }
}


// ======================================================
// SPEAKER
// ======================================================

function toggleSpeaker() {

  const audio =
    $("remoteAudio");

  if (!audio) return;

  isSpeakerOn =
    !isSpeakerOn;

  audio.muted =
    !isSpeakerOn;

  const button =
    $("speakerBtn");

  if (button) {
    button.textContent =
      isSpeakerOn
        ? "🔊 Speaker"
        : "🔇 Speaker";
  }
}


// ======================================================
// REJECT INCOMING CALL
// ======================================================

async function rejectCall() {

  if (!pendingIncomingCall) {
    return;
  }

  const callId =
    pendingIncomingCall.id;

  try {

    stopRingtone();

    await update(
      ref(db, `calls/${callId}`),
      {
        status:
          "rejected",

        endedAt:
          Date.now(),

        duration:
          0
      }
    );

    await saveCallHistory(
      callId,
      pendingIncomingCall.data,
      "rejected",
      0
    );

  } catch (error) {

    console.error(
      "REJECT ERROR:",
      error
    );

  }

  pendingIncomingCall =
    null;

  $("incomingCallOverlay")
    ?.classList.add("hidden");
}


// ======================================================
// CANCEL OUTGOING CALL
// ======================================================

async function cancelCall() {

  if (!currentCallId) {
    return;
  }

  const callId =
    currentCallId;

  try {

    await update(
      ref(db, `calls/${callId}`),
      {
        status:
          "cancelled",

        endedAt:
          Date.now()
      }
    );

    await saveMyHistory(
      callId,
      "cancelled"
    );

  } catch (error) {

    console.error(
      "CANCEL ERROR:",
      error
    );

  }

  await cleanupCall();
}


// ======================================================
// END ACTIVE CALL
// ======================================================

async function endCall() {

  if (!currentCallId) {
    await cleanupCall();
    return;
  }

  const callId =
    currentCallId;

  const duration =
    callStartTime
      ? Math.floor(
          (Date.now() -
            callStartTime) /
            1000
        )
      : 0;

  try {

    await update(
      ref(db, `calls/${callId}`),
      {
        status:
          "ended",

        endedAt:
          Date.now(),

        duration:
          duration
      }
    );

    await saveMyHistory(
      callId,
      "ended",
      duration
    );

  } catch (error) {

    console.error(
      "END CALL ERROR:",
      error
    );

  }

  await cleanupCall();
}


// ======================================================
// SAVE MY HISTORY
// ======================================================

async function saveMyHistory(
  callId,
  status,
  duration = 0
) {

  if (!currentUser) return;

  try {

    const historyRef =
      ref(
        db,
        `callHistory/${currentUser.uid}/${callId}`
      );

    await update(
      historyRef,
      {
        status:
          status,

        duration:
          duration,

        timestamp:
          Date.now(),

        remoteUid:
          currentRemoteUser?.uid ||
          "",

        remoteName:
          currentRemoteUser?.name ||
          "",

        remoteEmail:
          currentRemoteUser?.email ||
          ""
      }
    );

  } catch (error) {

    console.error(
      "SAVE HISTORY ERROR:",
      error
    );

  }
}


// ======================================================
// SAVE INCOMING HISTORY
// ======================================================

async function saveCallHistory(
  callId,
  call,
  status,
  duration
) {

  if (!currentUser) return;

  try {

    await set(
      ref(
        db,
        `callHistory/${currentUser.uid}/${callId}`
      ),
      {
        status:
          status,

        duration:
          duration,

        timestamp:
          Date.now(),

        remoteUid:
          call.callerId ||
          "",

        remoteName:
          call.callerName ||
          "",

        remoteEmail:
          call.callerEmail ||
          ""
      }
    );

  } catch (error) {

    console.error(
      "SAVE INCOMING HISTORY ERROR:",
      error
    );

  }
}


// ======================================================
// CALL STATUS MESSAGE
// ======================================================

function getCallStatusMessage(
  status
) {

  switch (status) {

    case "rejected":
      return "The call was rejected.";

    case "cancelled":
      return "The call was cancelled.";

    case "ended":
      return "The call ended.";

    case "missed":
      return "The call was missed.";

    case "failed":
      return "The call failed.";

    default:
      return "Call ended.";

  }
}


// ======================================================
// CLEANUP CALL
// ======================================================

async function cleanupCall() {

  stopRingtone();

  if (callTimerInterval) {

    clearInterval(
      callTimerInterval
    );

    callTimerInterval =
      null;
  }

  callStartTime =
    null;

  callUnsubscribers.forEach(
    unsubscribe => {

      try {
        unsubscribe();
      } catch (_) {}

    }
  );

  callUnsubscribers =
    [];

  if (peerConnection) {

    try {
      peerConnection.close();
    } catch (_) {}

    peerConnection =
      null;
  }

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => {
        track.stop();
      });

    localStream =
      null;
  }

  const remoteAudio =
    $("remoteAudio");

  if (remoteAudio) {
    remoteAudio.srcObject =
      null;

    remoteAudio.muted =
      false;
  }

  pendingRemoteCandidates =
    [];

  pendingIncomingCall =
    null;

  currentCallId =
    null;

  currentCallRole =
    null;

  currentRemoteUser =
    null;

  isMuted =
    false;

  isSpeakerOn =
    true;

  $("callOverlay")
    ?.classList.add("hidden");

  $("incomingCallOverlay")
    ?.classList.add("hidden");

  $("outgoingCallOverlay")
    ?.classList.add("hidden");

  if ($("muteBtn")) {
    $("muteBtn").textContent =
      "🎤 Mute";
  }

  if ($("speakerBtn")) {
    $("speakerBtn").textContent =
      "🔊 Speaker";
  }
}


// ======================================================
// RINGTONE
// ======================================================

function startRingtone() {

  stopRingtone();

  try {

    ringtoneContext =
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    const beep = () => {

      if (!ringtoneContext) {
        return;
      }

      const oscillator =
        ringtoneContext.createOscillator();

      const gain =
        ringtoneContext.createGain();

      oscillator.frequency.value =
        700;

      gain.gain.value =
        0.08;

      oscillator.connect(gain);
      gain.connect(
        ringtoneContext.destination
      );

      oscillator.start();

      oscillator.stop(
        ringtoneContext.currentTime +
        0.25
      );
    };

    beep();

    ringtoneTimer =
      setInterval(
        beep,
        1000
      );

  } catch (error) {

    console.warn(
      "Ringtone unavailable:",
      error
    );

  }
}


function stopRingtone() {

  if (ringtoneTimer) {

    clearInterval(
      ringtoneTimer
    );

    ringtoneTimer =
      null;
  }

  if (ringtoneContext) {

    try {
      ringtoneContext.close();
    } catch (_) {}

    ringtoneContext =
      null;
  }
}


// ======================================================
// BROWSER NOTIFICATIONS
// ======================================================

async function setupBrowserNotifications() {

  if (
    notificationPermissionAsked
  ) {
    return;
  }

  notificationPermissionAsked =
    true;

  if (
    "Notification" in window &&
    Notification.permission ===
      "default"
  ) {

    try {
      await Notification.requestPermission();
    } catch (_) {}

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
        body: body,
        icon: makeAvatar(
          currentProfile?.name ||
          "U"
        )
      }
    );

  } catch (error) {

    console.warn(
      "Notification error:",
      error
    );

  }
}


// ======================================================
// CALL HISTORY
// ======================================================

function listenForCallHistory() {

  if (historyUnsubscribe) {
    historyUnsubscribe();
  }

  if (!currentUser) return;

  const historyRef =
    ref(
      db,
      `callHistory/${currentUser.uid}`
    );

  historyUnsubscribe =
    onValue(
      historyRef,
      snapshot => {

        if (!snapshot.exists()) {
          renderCallHistory([]);
          return;
        }

        const data =
          snapshot.val();

        const history =
          Object.entries(data)
            .map(([id, item]) => ({
              id,
              ...item
            }))
            .sort(
              (a, b) =>
                (b.timestamp || 0) -
                (a.timestamp || 0)
            );

        renderCallHistory(history);

      },
      error => {

        console.error(
          "HISTORY ERROR:",
          error
        );

      }
    );
}


// ======================================================
// RENDER CALL HISTORY
// ======================================================

function renderCallHistory(history) {

  const container =
    $("callHistory");

  if (!container) return;

  if (!history.length) {

    container.innerHTML =
      "<p>No call history yet.</p>";

    return;
  }

  container.innerHTML =
    history
      .slice(0, 30)
      .map(item => {

        const name =
          item.remoteName ||
          item.remoteEmail ||
          "Unknown user";

        const status =
          item.status || "ended";

        const duration =
          formatDuration(
            item.duration || 0
          );

        const date =
          formatDate(
            item.timestamp
          );

        return `
          <div class="user-card">

            <img
              class="user-avatar"
              src="${makeAvatar(name)}"
              alt="${escapeHTML(name)}"
            >

            <div class="user-details">

              <strong>
                ${escapeHTML(name)}
              </strong>

              <span>
                ${escapeHTML(status)}
              </span>

              <small>
                ${escapeHTML(duration)}
                ${date
                  ? " • " +
                    escapeHTML(date)
                  : ""}
              </small>

            </div>

          </div>
        `;

      })
      .join("");
}


// ======================================================
// LOGOUT
// ======================================================

async function logout() {

  try {

    await cleanupCall();

    if (currentUser) {

      try {

        await update(
          ref(
            db,
            `users/${currentUser.uid}`
          ),
          {
            online: false,
            lastSeen: Date.now()
          }
        );

      } catch (error) {

        console.warn(
          "Presence update failed:",
          error
        );

      }
    }

    await signOut(auth);

  } catch (error) {

    console.error(
      "LOGOUT ERROR:",
      error
    );

    showNotification(
      "Could not log out."
    );
  }
}


// ======================================================
// CLEANUP EVERYTHING
// ======================================================

async function cleanupEverything() {

  await cleanupCall();

  if (usersUnsubscribe) {

    try {
      usersUnsubscribe();
    } catch (_) {}

    usersUnsubscribe =
      null;
  }

  if (incomingCallsUnsubscribe) {

    try {
      incomingCallsUnsubscribe();
    } catch (_) {}

    incomingCallsUnsubscribe =
      null;
  }

  if (historyUnsubscribe) {

    try {
      historyUnsubscribe();
    } catch (_) {}

    historyUnsubscribe =
      null;
  }

  userCache = {};
}


// ======================================================
// AUTH STATE
// ======================================================

onAuthStateChanged(
  auth,
  async user => {

    console.log(
      "AUTH STATE:",
      user
    );

    if (!user) {

      currentUser =
        null;

      currentProfile =
        null;

      await cleanupEverything();

      showScreen("auth");

      return;
    }

    currentUser =
      user;

    console.log(
      "AUTHENTICATED USER:",
      user.uid
    );

    console.log(
      "AUTH EMAIL:",
      user.email
    );

    // Show the app immediately.
    // This prevents a blank screen if
    // the database has a temporary problem.
    showScreen("main");

    updateMyUI();

    try {

      await loadMyProfile();

      console.log(
        "PROFILE LOADED:",
        currentProfile
      );

      updateMyUI();

      await setupPresence();

      console.log(
        "PRESENCE SETUP COMPLETE"
      );

      listenForUsers();

      listenForIncomingCalls();

      listenForCallHistory();

      setupBrowserNotifications();

    } catch (error) {

      console.error(
        "AUTH SETUP ERROR:",
        error
      );

      console.error(
        "ERROR CODE:",
        error?.code
      );

      console.error(
        "ERROR MESSAGE:",
        error?.message
      );

      showNotification(
        "Database error: " +
        (error?.message ||
          "Could not load account.")
      );
    }
  }
);


// ======================================================
// BUTTON EVENTS
// ======================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    $("loginBtn")
      ?.addEventListener(
        "click",
        login
      );

    $("registerBtn")
      ?.addEventListener(
        "click",
        register
      );

    $("logoutBtn")
      ?.addEventListener(
        "click",
        logout
      );


    $("showRegisterBtn")
      ?.addEventListener(
        "click",
        () => {

          $("loginForm")
            ?.classList.add("hidden");

          $("registerForm")
            ?.classList.remove("hidden");

          setAuthMessage("");

        }
      );


    $("showLoginBtn")
      ?.addEventListener(
        "click",
        () => {

          $("registerForm")
            ?.classList.add("hidden");

          $("loginForm")
            ?.classList.remove("hidden");

          setRegisterMessage("");

        }
      );


    $("acceptCallBtn")
      ?.addEventListener(
        "click",
        acceptCall
      );


    $("rejectCallBtn")
      ?.addEventListener(
        "click",
        rejectCall
      );


    $("cancelCallBtn")
      ?.addEventListener(
        "click",
        cancelCall
      );


    $("endCallBtn")
      ?.addEventListener(
        "click",
        endCall
      );


    $("muteBtn")
      ?.addEventListener(
        "click",
        toggleMute
      );


    $("speakerBtn")
      ?.addEventListener(
        "click",
        toggleSpeaker
      );

  }
);


// ======================================================
// ENTER KEY SUPPORT
// ======================================================

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key !== "Enter"
    ) {
      return;
    }

    const active =
      document.activeElement;

    if (
      active?.id ===
        "loginEmail" ||
      active?.id ===
        "loginPassword"
    ) {
      login();
    }

    if (
      active?.id ===
        "registerName" ||
      active?.id ===
        "registerEmail" ||
      active?.id ===
        "registerPassword" ||
      active?.id ===
        "registerConfirmPassword"
    ) {
      register();
    }

  }
);


console.log(
  "VOICE CHAT APP.JS LOADED SUCCESSFULLY"
);
