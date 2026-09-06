// ============================================================
// VOICE CHAT APP - FULL app.js
// Firebase Auth + Realtime Database + WebRTC
// ============================================================

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


// ============================================================
// FIREBASE CONFIG
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
// INITIALIZE FIREBASE
// ============================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);


// ============================================================
// GLOBAL VARIABLES
// ============================================================

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


// ============================================================
// WEBRTC CONFIG
// ============================================================

const rtcConfiguration = {
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
// HELPER
// ============================================================

function $(id) {
  return document.getElementById(id);
}


// ============================================================
// AVATAR
// ============================================================

function makeAvatar(name = "User") {
  const letter = String(name).trim().charAt(0).toUpperCase() || "U";

  return (
    "https://ui-avatars.com/api/?name=" +
    encodeURIComponent(letter) +
    "&background=random&color=fff&size=256"
  );
}


// ============================================================
// NOTIFICATION
// ============================================================

function showNotification(message, duration = 4000) {
  const notification = $("notification");

  if (!notification) return;

  notification.textContent = message;
  notification.classList.remove("hidden");

  setTimeout(() => {
    notification.classList.add("hidden");
  }, duration);
}


// ============================================================
// BROWSER NOTIFICATION
// ============================================================

async function requestNotificationPermission() {
  if (
    notificationPermissionAsked ||
    !("Notification" in window)
  ) {
    return;
  }

  notificationPermissionAsked = true;

  try {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch (error) {
    console.warn("Notification permission error:", error);
  }
}


function sendBrowserNotification(title, body) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  try {
    new Notification(title, {
      body
    });
  } catch (error) {
    console.warn("Browser notification error:", error);
  }
}


// ============================================================
// SCREEN CONTROL
// ============================================================

function showScreen(screen) {
  const authSection = $("authSection");
  const mainSection = $("mainSection");

  if (screen === "auth") {
    authSection?.classList.remove("hidden");
    mainSection?.classList.add("hidden");
  }

  if (screen === "main") {
    authSection?.classList.add("hidden");
    mainSection?.classList.remove("hidden");
  }
}


// ============================================================
// AUTH MESSAGE
// ============================================================

function setAuthMessage(message, register = false) {
  const element = register
    ? $("registerMessage")
    : $("authMessage");

  if (element) {
    element.textContent = message;
  }
}


// ============================================================
// AUTH FORM SWITCHING
// ============================================================

$("showRegisterBtn")?.addEventListener("click", () => {
  $("loginForm")?.classList.add("hidden");
  $("registerForm")?.classList.remove("hidden");

  setAuthMessage("");
  setAuthMessage("", true);
});


$("showLoginBtn")?.addEventListener("click", () => {
  $("registerForm")?.classList.add("hidden");
  $("loginForm")?.classList.remove("hidden");

  setAuthMessage("");
  setAuthMessage("", true);
});


// ============================================================
// REGISTER
// ============================================================

$("registerBtn")?.addEventListener("click", async () => {
  const name = $("registerName")?.value.trim();
  const email = $("registerEmail")?.value.trim();
  const password = $("registerPassword")?.value;
  const confirmPassword =
    $("registerConfirmPassword")?.value;

  if (!name || !email || !password || !confirmPassword) {
    setAuthMessage(
      "Please fill in all fields.",
      true
    );
    return;
  }

  if (password !== confirmPassword) {
    setAuthMessage(
      "Passwords do not match.",
      true
    );
    return;
  }

  if (password.length < 6) {
    setAuthMessage(
      "Password must be at least 6 characters.",
      true
    );
    return;
  }

  const button = $("registerBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Creating account...";
  }

  try {
    const result =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await updateProfile(result.user, {
      displayName: name
    });

    await set(
      ref(db, `users/${result.user.uid}`),
      {
        uid: result.user.uid,
        name,
        email,
        online: true,
        createdAt: Date.now(),
        lastSeen: Date.now()
      }
    );

    setAuthMessage(
      "Account created successfully!",
      true
    );
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    setAuthMessage(
      error.message || "Could not create account.",
      true
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Register";
    }
  }
});


// ============================================================
// LOGIN
// ============================================================

$("loginBtn")?.addEventListener("click", async () => {
  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    setAuthMessage(
      "Please enter your email and password."
    );
    return;
  }

  const button = $("loginBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Logging in...";
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    setAuthMessage("Login successful.");
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    setAuthMessage(
      error.message || "Could not log in."
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Login";
    }
  }
});


// ============================================================
// LOGOUT
// ============================================================

$("logoutBtn")?.addEventListener("click", async () => {
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
});


// ============================================================
// AUTH STATE
// ============================================================

onAuthStateChanged(auth, async user => {
  console.log(
    "AUTH STATE:",
    user ? user.uid : "SIGNED OUT"
  );

  if (!user) {
    currentUser = null;
    currentProfile = null;

    stopAllListeners();
    hideAllCallOverlays();

    showScreen("auth");
    return;
  }

  currentUser = user;

  showScreen("main");

  updateMyUI();

  await requestNotificationPermission();

  // Start incoming call listener immediately.
  // This is important so incoming calls are not missed.
  listenForIncomingCalls();

  try {
    await loadMyProfile();
  } catch (error) {
    console.error("PROFILE LOAD ERROR:", error);
  }

  try {
    await setupPresence();
  } catch (error) {
    console.error("PRESENCE ERROR:", error);
  }

  try {
    listenForUsers();
  } catch (error) {
    console.error("USERS LISTENER ERROR:", error);
  }

  try {
    listenForHistory();
  } catch (error) {
    console.error("HISTORY LISTENER ERROR:", error);
  }
});


// ============================================================
// LOAD MY PROFILE
// ============================================================

async function loadMyProfile() {
  if (!currentUser) return;

  const snapshot = await get(
    ref(db, `users/${currentUser.uid}`)
  );

  if (snapshot.exists()) {
    currentProfile = snapshot.val();
  } else {
    currentProfile = {
      uid: currentUser.uid,
      name:
        currentUser.displayName ||
        currentUser.email ||
        "User",
      email: currentUser.email || "",
      online: true,
      createdAt: Date.now(),
      lastSeen: Date.now()
    };

    await set(
      ref(db, `users/${currentUser.uid}`),
      currentProfile
    );
  }

  updateMyUI();
}


// ============================================================
// UPDATE MY UI
// ============================================================

function updateMyUI() {
  if (!currentUser) return;

  const name =
    currentProfile?.name ||
    currentUser.displayName ||
    currentUser.email ||
    "User";

  const email =
    currentProfile?.email ||
    currentUser.email ||
    "";

  const welcomeText = $("welcomeText");
  const myAvatar = $("myAvatar");

  if (welcomeText) {
    welcomeText.textContent = `Welcome, ${name}`;
  }

  if (myAvatar) {
    myAvatar.src = makeAvatar(name);
    myAvatar.alt = name;
  }
}


// ============================================================
// PRESENCE
// ============================================================

async function setupPresence() {
  if (!currentUser) return;

  const userRef =
    ref(db, `users/${currentUser.uid}`);

  await update(userRef, {
    online: true,
    lastSeen: Date.now()
  });

  onDisconnect(userRef).update({
    online: false,
    lastSeen: serverTimestamp()
  });
}


// ============================================================
// LISTEN FOR USERS
// ============================================================

function listenForUsers() {
  if (usersUnsubscribe) {
    usersUnsubscribe();
    usersUnsubscribe = null;
  }

  if (!currentUser) return;

  const usersRef = ref(db, "users");

  usersUnsubscribe = onValue(
    usersRef,
    snapshot => {
      const usersList = $("usersList");

      if (!usersList) return;

      usersList.innerHTML = "";

      if (!snapshot.exists()) {
        usersList.innerHTML =
          "<p>No other users found.</p>";
        return;
      }

      const users = snapshot.val();

      userCache = {};

      Object.entries(users).forEach(
        ([uid, user]) => {
          if (!user) return;

          userCache[uid] = user;

          if (uid === currentUser.uid) {
            return;
          }

          const userElement =
            document.createElement("div");

          userElement.className = "user-item";

          const avatar =
            document.createElement("img");

          avatar.src =
            makeAvatar(
              user.name ||
              user.email ||
              "User"
            );

          avatar.alt =
            user.name ||
            user.email ||
            "User";

          const info =
            document.createElement("div");

          info.className = "user-info";

          const name =
            document.createElement("div");

          name.className = "user-name";

          name.textContent =
            user.name ||
            user.email ||
            "User";

          const email =
            document.createElement("div");

          email.className = "user-email";

          email.textContent =
            user.email || "";

          const status =
            document.createElement("div");

          status.className =
            user.online
              ? "user-online"
              : "user-offline";

          status.textContent =
            user.online
              ? "Online"
              : "Offline";

          info.appendChild(name);
          info.appendChild(email);
          info.appendChild(status);

          const callButton =
            document.createElement("button");

          callButton.textContent =
            "📞 Call";

          callButton.addEventListener(
            "click",
            () => startCall(user)
          );

          userElement.appendChild(avatar);
          userElement.appendChild(info);
          userElement.appendChild(callButton);

          usersList.appendChild(
            userElement
          );
        }
      );
    },
    error => {
      console.error(
        "USERS LISTENER ERROR:",
        error
      );
    }
  );
}


// ============================================================
// INCOMING CALL LISTENER
// ============================================================
// IMPORTANT FIX:
// Uses onValue instead of only onChildAdded.
// ============================================================

function listenForIncomingCalls() {
  if (incomingCallsUnsubscribe) {
    try {
      incomingCallsUnsubscribe();
    } catch (error) {
      console.warn(
        "Could not remove old incoming listener:",
        error
      );
    }

    incomingCallsUnsubscribe = null;
  }

  if (!currentUser) {
    console.warn(
      "INCOMING CALL LISTENER: No logged-in user."
    );
    return;
  }

  console.log(
    "INCOMING CALL LISTENER STARTED FOR:",
    currentUser.uid
  );

  const callsRef = ref(db, "calls");

  incomingCallsUnsubscribe = onValue(
    callsRef,
    snapshot => {
      console.log(
        "CALLS DATABASE UPDATED"
      );

      if (!snapshot.exists()) {
        console.log(
          "No calls currently exist."
        );
        return;
      }

      const calls = snapshot.val();

      Object.entries(calls).forEach(
        ([callId, call]) => {
          if (!call) return;

          console.log(
            "CHECKING CALL:",
            callId,
            call
          );

          if (
            call.calleeId !==
            currentUser.uid
          ) {
            return;
          }

          if (
            call.status !== "ringing"
          ) {
            return;
          }

          if (currentCallId) {
            return;
          }

          if (
            pendingIncomingCall &&
            pendingIncomingCall.id === callId
          ) {
            return;
          }

          console.log(
            "📞 INCOMING CALL FOUND:",
            call.callerName,
            call.callerEmail
          );

          showIncomingCall(
            callId,
            call
          );
        }
      );
    },
    error => {
      console.error(
        "❌ INCOMING CALL LISTENER ERROR:",
        error
      );

      showNotification(
        "Could not listen for incoming calls: " +
        (error.message ||
          "Unknown database error")
      );
    }
  );
}


// ============================================================
// SHOW INCOMING CALL
// ============================================================

function showIncomingCall(
  callId,
  call
) {
  if (!currentUser) {
    console.warn(
      "Cannot show incoming call: no current user."
    );
    return;
  }

  if (currentCallId) {
    console.log(
      "Already in a call. Ignoring incoming call."
    );
    return;
  }

  if (!call) {
    console.warn(
      "Incoming call data is missing."
    );
    return;
  }

  pendingIncomingCall = {
    id: callId,
    data: call
  };

  const name =
    call.callerName ||
    call.callerEmail ||
    "Unknown caller";

  const email =
    call.callerEmail ||
    "";

  console.log(
    "📞 SHOWING INCOMING CALL"
  );

  console.log(
    "Caller:",
    name
  );

  console.log(
    "Email:",
    email
  );

  console.log(
    "Call ID:",
    callId
  );

  const nameElement =
    $("incomingCallerName");

  const emailElement =
    $("incomingCallerEmail");

  const avatarElement =
    $("incomingCallerAvatar");

  const indicatorElement =
    $("ringingIndicator");

  const overlay =
    $("incomingCallOverlay");

  if (nameElement) {
    nameElement.textContent =
      name;
  }

  if (emailElement) {
    emailElement.textContent =
      email;
  }

  if (avatarElement) {
    avatarElement.src =
      makeAvatar(name);

    avatarElement.alt =
      name;
  }

  if (indicatorElement) {
    indicatorElement.textContent =
      "📞 Incoming call...";
  }

  if (overlay) {
    overlay.classList.remove("hidden");
  } else {
    console.error(
      "❌ incomingCallOverlay was not found in index.html"
    );
  }

  startRingtone();

  sendBrowserNotification(
    "Incoming voice call",
    `${name} is calling you`
  );
}


// ============================================================
// INCOMING CALL ACCEPT
// ============================================================

$("acceptCallBtn")?.addEventListener(
  "click",
  acceptCall
);


async function acceptCall() {
  if (!pendingIncomingCall) {
    console.warn(
      "No pending incoming call."
    );
    return;
  }

  const callId =
    pendingIncomingCall.id;

  const call =
    pendingIncomingCall.data;

  if (!call) return;

  console.log(
    "ACCEPTING CALL:",
    callId
  );

  stopRingtone();

  $("incomingCallOverlay")
    ?.classList.add("hidden");

  try {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    localStream = stream;

    currentCallId = callId;
    currentCallRole = "callee";

    currentRemoteUser = {
      uid: call.callerId || "",
      name:
        call.callerName ||
        call.callerEmail ||
        "User",
      email:
        call.callerEmail || ""
    };

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

    if (call.offer) {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(
          call.offer
        )
      );
    }

    await addPendingRemoteCandidates();

    listenForCallerCandidates(
      callId
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
        status: "accepted",
        startedAt: Date.now()
      }
    );

    pendingIncomingCall = null;

    showActiveCall();

    startCallTimer();

    listenForActiveCallChanges(
      callId
    );

    console.log(
      "CALL ACCEPTED SUCCESSFULLY"
    );
  } catch (error) {
    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    showNotification(
      "Could not accept call: " +
      (error.message || "Unknown error")
    );

    try {
      await update(
        ref(db, `calls/${callId}`),
        {
          status: "failed"
        }
      );
    } catch (updateError) {
      console.error(
        "FAILED TO UPDATE CALL:",
        updateError
      );
    }

    await cleanupCall(false);
  }
}


// ============================================================
// REJECT INCOMING CALL
// ============================================================

$("rejectCallBtn")?.addEventListener(
  "click",
  rejectCall
);


async function rejectCall() {
  if (!pendingIncomingCall) {
    return;
  }

  const callId =
    pendingIncomingCall.id;

  const call =
    pendingIncomingCall.data;

  stopRingtone();

  $("incomingCallOverlay")
    ?.classList.add("hidden");

  try {
    await update(
      ref(db, `calls/${callId}`),
      {
        status: "rejected",
        endedAt: Date.now()
      }
    );

    await saveMyHistory(
      callId,
      "rejected",
      0,
      call
    );
  } catch (error) {
    console.error(
      "REJECT CALL ERROR:",
      error
    );
  }

  pendingIncomingCall = null;
}


// ============================================================
// START OUTGOING CALL
// ============================================================

async function startCall(user) {
  if (!currentUser) {
    showNotification(
      "Please log in first."
    );
    return;
  }

  if (currentCallId) {
    showNotification(
      "You are already in a call."
    );
    return;
  }

  if (!user?.uid) {
    showNotification(
      "This user cannot be called."
    );
    return;
  }

  console.log(
    "STARTING CALL TO:",
    user
  );

  try {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    localStream = stream;

    const callsRef =
      ref(db, "calls");

    const newCallRef =
      push(callsRef);

    const callId =
      newCallRef.key;

    currentCallId = callId;
    currentCallRole = "caller";

    currentRemoteUser = {
      uid: user.uid,
      name:
        user.name ||
        user.email ||
        "User",
      email:
        user.email || ""
    };

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

    listenForCalleeCandidates(
      callId
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
      callerId: currentUser.uid,

      calleeId: user.uid,

      callerName,

      callerEmail:
        currentUser.email || "",

      calleeName:
        user.name ||
        user.email ||
        "User",

      calleeEmail:
        user.email || "",

      status: "ringing",

      offer: {
        type: offer.type,
        sdp: offer.sdp
      },

      createdAt: Date.now()
    };

    await set(
      newCallRef,
      callData
    );

    console.log(
      "CALL CREATED:",
      callId,
      callData
    );

    showOutgoingCall(
      currentRemoteUser
    );

    startRingtone();

    listenForOutgoingCallChanges(
      callId
    );
  } catch (error) {
    console.error(
      "START CALL ERROR:",
      error
    );

    showNotification(
      "Could not start call: " +
      (error.message || "Unknown error")
    );

    await cleanupCall(false);
  }
}


// ============================================================
// CREATE PEER CONNECTION
// ============================================================

function createPeerConnection() {
  const pc =
    new RTCPeerConnection(
      rtcConfiguration
    );

  pc.onicecandidate = event => {
    if (!event.candidate) return;

    if (
      !currentCallId ||
      !currentCallRole
    ) {
      return;
    }

    const candidateData = {
      candidate:
        event.candidate.candidate,

      sdpMid:
        event.candidate.sdpMid,

      sdpMLineIndex:
        event.candidate.sdpMLineIndex
    };

    const path =
      currentCallRole === "caller"
        ? `calls/${currentCallId}/callerCandidates`
        : `calls/${currentCallId}/calleeCandidates`;

    push(
      ref(db, path),
      candidateData
    ).catch(error => {
      console.error(
        "ICE CANDIDATE SAVE ERROR:",
        error
      );
    });
  };

  pc.ontrack = event => {
    console.log(
      "REMOTE TRACK RECEIVED"
    );

    const remoteAudio =
      $("remoteAudio");

    if (
      remoteAudio &&
      event.streams &&
      event.streams[0]
    ) {
      remoteAudio.srcObject =
        event.streams[0];

      remoteAudio
        .play()
        .catch(error => {
          console.warn(
            "Remote audio play blocked:",
            error
          );
        });
    }
  };

  pc.onconnectionstatechange =
    () => {
      console.log(
        "WEBRTC CONNECTION STATE:",
        pc.connectionState
      );

      if (
        pc.connectionState ===
          "connected"
      ) {
        console.log(
          "🎉 CALL CONNECTED"
        );

        stopRingtone();

        updateCallStatus(
          "Connected"
        );
      }

      if (
        pc.connectionState ===
          "failed"
      ) {
        showNotification(
          "Call connection failed."
        );
      }

      if (
        pc.connectionState ===
          "disconnected"
      ) {
        updateCallStatus(
          "Disconnected"
        );
      }
    };

  pc.oniceconnectionstatechange =
    () => {
      console.log(
        "ICE STATE:",
        pc.iceConnectionState
      );
    };

  return pc;
}


// ============================================================
// CALLEE CANDIDATES
// ============================================================

function listenForCalleeCandidates(
  callId
) {
  const candidatesRef =
    ref(
      db,
      `calls/${callId}/calleeCandidates`
    );

  const unsubscribe =
    onChildAdded(
      candidatesRef,
      async snapshot => {
        const candidate =
          snapshot.val();

        if (!candidate) return;

        if (
          !peerConnection
        ) {
          return;
        }

        try {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              candidate
            )
          );
        } catch (error) {
          console.error(
            "ADD CALLEE ICE ERROR:",
            error
          );
        }
      }
    );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ============================================================
// CALLER CANDIDATES
// ============================================================

function listenForCallerCandidates(
  callId
) {
  const candidatesRef =
    ref(
      db,
      `calls/${callId}/callerCandidates`
    );

  const unsubscribe =
    onChildAdded(
      candidatesRef,
      async snapshot => {
        const candidate =
          snapshot.val();

        if (!candidate) return;

        if (
          !peerConnection
        ) {
          pendingRemoteCandidates.push(
            candidate
          );
          return;
        }

        try {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              candidate
            )
          );
        } catch (error) {
          console.error(
            "ADD CALLER ICE ERROR:",
            error
          );
        }
      }
    );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ============================================================
// ADD PENDING ICE CANDIDATES
// ============================================================

async function addPendingRemoteCandidates() {
  if (!peerConnection) {
    return;
  }

  if (
    !pendingRemoteCandidates.length
  ) {
    return;
  }

  const candidates = [
    ...pendingRemoteCandidates
  ];

  pendingRemoteCandidates = [];

  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      );
    } catch (error) {
      console.error(
        "PENDING ICE ERROR:",
        error
      );
    }
  }
}


// ============================================================
// OUTGOING CALL LISTENER
// ============================================================

function listenForOutgoingCallChanges(
  callId
) {
  const callRef =
    ref(db, `calls/${callId}`);

  const unsubscribe =
    onValue(
      callRef,
      async snapshot => {
        if (!snapshot.exists()) {
          return;
        }

        const call =
          snapshot.val();

        console.log(
          "OUTGOING CALL UPDATED:",
          call
        );

        if (
          call.status ===
          "accepted"
        ) {
          stopRingtone();

          if (
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

              await addPendingRemoteCandidates();

              showActiveCall();

              startCallTimer();
            } catch (error) {
              console.error(
                "SET REMOTE ANSWER ERROR:",
                error
              );
            }
          }
        }

        if (
          call.status ===
          "rejected"
        ) {
          stopRingtone();

          await saveMyHistory(
            callId,
            "rejected",
            0,
            call
          );

          showNotification(
            "Call was rejected."
          );

          await cleanupCall(
            false
          );
        }

        if (
          call.status ===
          "cancelled"
        ) {
          stopRingtone();

          await saveMyHistory(
            callId,
            "cancelled",
            0,
            call
          );

          showNotification(
            "Call was cancelled."
          );

          await cleanupCall(
            false
          );
        }

        if (
          call.status ===
          "ended"
        ) {
          stopRingtone();

          const duration =
            getCallDuration();

          await saveMyHistory(
            callId,
            "ended",
            duration,
            call
          );

          await cleanupCall(
            false
          );
        }

        if (
          call.status ===
          "failed"
        ) {
          stopRingtone();

          showNotification(
            "Call failed."
          );

          await cleanupCall(
            false
          );
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


// ============================================================
// ACTIVE CALL LISTENER
// ============================================================

function listenForActiveCallChanges(
  callId
) {
  const callRef =
    ref(db, `calls/${callId}`);

  const unsubscribe =
    onValue(
      callRef,
      async snapshot => {
        if (!snapshot.exists()) {
          return;
        }

        const call =
          snapshot.val();

        if (
          call.status ===
          "cancelled"
        ) {
          showNotification(
            "The caller cancelled the call."
          );

          await saveMyHistory(
            callId,
            "cancelled",
            getCallDuration(),
            call
          );

          await cleanupCall(
            false
          );
        }

        if (
          call.status ===
          "ended"
        ) {
          await saveMyHistory(
            callId,
            "ended",
            getCallDuration(),
            call
          );

          await cleanupCall(
            false
          );
        }
      },
      error => {
        console.error(
          "ACTIVE CALL LISTENER ERROR:",
          error
        );
      }
    );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ============================================================
// SHOW OUTGOING CALL
// ============================================================

function showOutgoingCall(
  user
) {
  const overlay =
    $("outgoingCallOverlay");

  const avatar =
    $("outgoingCallerAvatar");

  const name =
    $("outgoingCallerName");

  const status =
    $("outgoingCallStatus");

  if (avatar) {
    avatar.src =
      makeAvatar(
        user.name ||
        user.email ||
        "User"
      );
  }

  if (name) {
    name.textContent =
      user.name ||
      user.email ||
      "User";
  }

  if (status) {
    status.textContent =
      "Calling...";
  }

  overlay?.classList.remove(
    "hidden"
  );
}


// ============================================================
// CANCEL OUTGOING CALL
// ============================================================

$("cancelCallBtn")?.addEventListener(
  "click",
  cancelOutgoingCall
);


async function cancelOutgoingCall() {
  if (!currentCallId) {
    return;
  }

  const callId =
    currentCallId;

  try {
    await update(
      ref(db, `calls/${callId}`),
      {
        status: "cancelled",
        endedAt: Date.now()
      }
    );

    const snapshot =
      await get(
        ref(db, `calls/${callId}`)
      );

    if (snapshot.exists()) {
      await saveMyHistory(
        callId,
        "cancelled",
        0,
        snapshot.val()
      );
    }
  } catch (error) {
    console.error(
      "CANCEL CALL ERROR:",
      error
    );
  }

  stopRingtone();

  await cleanupCall(
    false
  );
}


// ============================================================
// SHOW ACTIVE CALL
// ============================================================

function showActiveCall() {
  $("outgoingCallOverlay")
    ?.classList.add("hidden");

  $("incomingCallOverlay")
    ?.classList.add("hidden");

  const overlay =
    $("callOverlay");

  const avatar =
    $("callAvatar");

  const callType =
    $("callType");

  const name =
    $("callName");

  const status =
    $("callStatus");

  const timer =
    $("callTimer");

  const remoteName =
    currentRemoteUser?.name ||
    currentRemoteUser?.email ||
    "User";

  if (avatar) {
    avatar.src =
      makeAvatar(remoteName);

    avatar.alt =
      remoteName;
  }

  if (callType) {
    callType.textContent =
      "Voice Call";
  }

  if (name) {
    name.textContent =
      remoteName;
  }

  if (status) {
    status.textContent =
      "Connecting...";
  }

  if (timer) {
    timer.textContent =
      "00:00";
  }

  overlay?.classList.remove(
    "hidden"
  );
}


// ============================================================
// CALL STATUS UI
// ============================================================

function updateCallStatus(
  text
) {
  const status =
    $("callStatus");

  if (status) {
    status.textContent =
      text;
  }
}


// ============================================================
// TIMER
// ============================================================

function startCallTimer() {
  stopCallTimer();

  callStartTime =
    Date.now();

  const timer =
    $("callTimer");

  callTimerInterval =
    setInterval(() => {
      const elapsed =
        Math.floor(
          (Date.now() -
            callStartTime) /
            1000
        );

      const minutes =
        Math.floor(
          elapsed / 60
        );

      const seconds =
        elapsed % 60;

      if (timer) {
        timer.textContent =
          String(minutes).padStart(
            2,
            "0"
          ) +
          ":" +
          String(seconds).padStart(
            2,
            "0"
          );
      }
    }, 1000);
}


function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(
      callTimerInterval
    );

    callTimerInterval = null;
  }
}


function getCallDuration() {
  if (!callStartTime) {
    return 0;
  }

  return Math.floor(
    (Date.now() -
      callStartTime) /
      1000
  );
}


// ============================================================
// MUTE
// ============================================================

$("muteBtn")?.addEventListener(
  "click",
  () => {
    if (!localStream) {
      return;
    }

    isMuted = !isMuted;

    localStream
      .getAudioTracks()
      .forEach(track => {
        track.enabled =
          !isMuted;
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
);


// ============================================================
// SPEAKER
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

    const button =
      $("speakerBtn");

    if (button) {
      button.textContent =
        isSpeakerOn
          ? "🔊 Speaker"
          : "🔇 Speaker";
    }
  }
);


// ============================================================
// END CALL
// ============================================================

$("endCallBtn")?.addEventListener(
  "click",
  endCall
);


async function endCall() {
  if (!currentCallId) {
    await cleanupCall(
      false
    );

    return;
  }

  const callId =
    currentCallId;

  try {
    await update(
      ref(db, `calls/${callId}`),
      {
        status: "ended",
        endedAt: Date.now()
      }
    );

    const snapshot =
      await get(
        ref(db, `calls/${callId}`)
      );

    if (snapshot.exists()) {
      await saveMyHistory(
        callId,
        "ended",
        getCallDuration(),
        snapshot.val()
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
}


// ============================================================
// HISTORY - GET REMOTE USER
// ============================================================

function getRemoteUserFromCall(
  call
) {
  if (
    !call ||
    !currentUser
  ) {
    return null;
  }

  if (
    call.callerId ===
    currentUser.uid
  ) {
    return {
      uid:
        call.calleeId || "",

      name:
        call.calleeName ||
        call.calleeEmail ||
        "User",

      email:
        call.calleeEmail ||
        ""
    };
  }

  if (
    call.calleeId ===
    currentUser.uid
  ) {
    return {
      uid:
        call.callerId || "",

      name:
        call.callerName ||
        call.callerEmail ||
        "User",

      email:
        call.callerEmail ||
        ""
    };
  }

  return null;
}


// ============================================================
// SAVE HISTORY
// ============================================================

async function saveMyHistory(
  callId,
  status,
  duration,
  call
) {
  if (!currentUser) {
    return;
  }

  try {
    const remote =
      getRemoteUserFromCall(
        call
      ) ||
      currentRemoteUser ||
      {};

    const historyRef =
      push(
        ref(
          db,
          `history/${currentUser.uid}`
        )
      );

    await set(
      historyRef,
      {
        callId:
          callId || "",

        remoteUid:
          remote.uid || "",

        remoteName:
          remote.name ||
          remote.email ||
          "User",

        remoteEmail:
          remote.email ||
          "",

        status:
          status || "ended",

        duration:
          Number(duration) || 0,

        createdAt:
          Date.now()
      }
    );

    console.log(
      "HISTORY SAVED:",
      remote
    );
  } catch (error) {
    console.error(
      "SAVE HISTORY ERROR:",
      error
    );
  }
}


// ============================================================
// LISTEN FOR HISTORY
// ============================================================

function listenForHistory() {
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
      `history/${currentUser.uid}`
    );

  historyUnsubscribe =
    onValue(
      historyRef,
      snapshot => {
        renderHistory(
          snapshot
        );
      },
      error => {
        console.error(
          "HISTORY ERROR:",
          error
        );
      }
    );
}


// ============================================================
// RENDER HISTORY
// ============================================================

function renderHistory(
  snapshot
) {
  // Supports several possible history containers.
  const container =
    $("historyList") ||
    $("callHistory") ||
    $("history");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!snapshot.exists()) {
    container.innerHTML =
      "<p>No call history yet.</p>";
    return;
  }

  const history =
    snapshot.val();

  const entries =
    Object.entries(history)
      .map(
        ([id, item]) => ({
          id,
          ...item
        })
      )
      .sort(
        (a, b) =>
          (b.createdAt || 0) -
          (a.createdAt || 0)
      );

  entries.forEach(item => {
    const name =
      item.remoteName ||
      item.remoteEmail ||
      "User";

    const email =
      item.remoteEmail ||
      "";

    const element =
      document.createElement("div");

    element.className =
      "history-item";

    const avatar =
      document.createElement("img");

    avatar.src =
      makeAvatar(name);

    avatar.alt =
      name;

    const info =
      document.createElement("div");

    info.className =
      "history-info";

    const nameElement =
      document.createElement("div");

    nameElement.className =
      "history-name";

    nameElement.textContent =
      name;

    const emailElement =
      document.createElement("div");

    emailElement.className =
      "history-email";

    emailElement.textContent =
      email;

    const statusElement =
      document.createElement("div");

    statusElement.className =
      "history-status";

    statusElement.textContent =
      formatHistoryStatus(
        item.status
      );

    const durationElement =
      document.createElement("div");

    durationElement.className =
      "history-duration";

    durationElement.textContent =
      formatDuration(
        item.duration || 0
      );

    info.appendChild(
      nameElement
    );

    if (email) {
      info.appendChild(
        emailElement
      );
    }

    info.appendChild(
      statusElement
    );

    info.appendChild(
      durationElement
    );

    element.appendChild(
      avatar
    );

    element.appendChild(
      info
    );

    container.appendChild(
      element
    );
  });
}


// ============================================================
// HISTORY STATUS
// ============================================================

function formatHistoryStatus(
  status
) {
  switch (status) {
    case "rejected":
      return "❌ Rejected";

    case "cancelled":
      return "↩️ Cancelled";

    case "failed":
      return "⚠️ Failed";

    case "ended":
      return "📞 Completed";

    default:
      return "📞 Call";
  }
}


// ============================================================
// FORMAT DURATION
// ============================================================

function formatDuration(
  seconds
) {
  seconds =
    Number(seconds) || 0;

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remaining =
    seconds % 60;

  return (
    String(minutes).padStart(
      2,
      "0"
    ) +
    ":" +
    String(remaining).padStart(
      2,
      "0"
    )
  );
}


// ============================================================
// RINGTONE
// ============================================================

function startRingtone() {
  stopRingtone();

  try {
    ringtoneContext =
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    const playTone = () => {
      if (!ringtoneContext) {
        return;
      }

      const oscillator =
        ringtoneContext.createOscillator();

      const gain =
        ringtoneContext.createGain();

      oscillator.type =
        "sine";

      oscillator.frequency.value =
        700;

      gain.gain.setValueAtTime(
        0.0001,
        ringtoneContext.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.15,
        ringtoneContext.currentTime +
          0.03
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ringtoneContext.currentTime +
          0.5
      );

      oscillator.connect(
        gain
      );

      gain.connect(
        ringtoneContext.destination
      );

      oscillator.start();

      oscillator.stop(
        ringtoneContext.currentTime +
          0.5
      );
    };

    playTone();

    ringtoneTimer =
      setInterval(
        playTone,
        1200
      );
  } catch (error) {
    console.warn(
      "RINGTONE ERROR:",
      error
    );
  }
}


// ============================================================
// STOP RINGTONE
// ============================================================

function stopRingtone() {
  if (ringtoneTimer) {
    clearInterval(
      ringtoneTimer
    );

    ringtoneTimer = null;
  }

  if (ringtoneContext) {
    try {
      ringtoneContext.close();
    } catch (error) {
      console.warn(
        "Could not close ringtone:",
        error
      );
    }

    ringtoneContext = null;
  }
}


// ============================================================
// HIDE ALL CALL OVERLAYS
// ============================================================

function hideAllCallOverlays() {
  $("incomingCallOverlay")
    ?.classList.add("hidden");

  $("outgoingCallOverlay")
    ?.classList.add("hidden");

  $("callOverlay")
    ?.classList.add("hidden");
}


// ============================================================
// STOP LISTENERS
// ============================================================

function stopAllListeners() {
  if (usersUnsubscribe) {
    usersUnsubscribe();
    usersUnsubscribe = null;
  }

  if (incomingCallsUnsubscribe) {
    incomingCallsUnsubscribe();
    incomingCallsUnsubscribe = null;
  }

  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }

  callUnsubscribers.forEach(
    unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn(
          "Listener cleanup error:",
          error
        );
      }
    }
  );

  callUnsubscribers = [];
}


// ============================================================
// CLEANUP CALL
// ============================================================

async function cleanupCall(
  updateDatabase = false
) {
  const callId =
    currentCallId;

  stopRingtone();
  stopCallTimer();

  if (
    updateDatabase &&
    callId
  ) {
    try {
      await update(
        ref(db, `calls/${callId}`),
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

  callUnsubscribers.forEach(
    unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn(
          "CALL LISTENER CLEANUP ERROR:",
          error
        );
      }
    }
  );

  callUnsubscribers = [];

  if (localStream) {
    localStream
      .getTracks()
      .forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.warn(
            "TRACK STOP ERROR:",
            error
          );
        }
      });

    localStream = null;
  }

  if (peerConnection) {
    try {
      peerConnection.close();
    } catch (error) {
      console.warn(
        "PEER CONNECTION CLOSE ERROR:",
        error
      );
    }

    peerConnection = null;
  }

  const remoteAudio =
    $("remoteAudio");

  if (remoteAudio) {
    remoteAudio.srcObject =
      null;
  }

  currentCallId = null;
  currentCallRole = null;
  currentRemoteUser = null;

  pendingIncomingCall = null;
  pendingRemoteCandidates = [];

  callStartTime = null;

  isMuted = false;
  isSpeakerOn = true;

  const muteBtn =
    $("muteBtn");

  if (muteBtn) {
    muteBtn.textContent =
      "🎤 Mute";
  }

  const speakerBtn =
    $("speakerBtn");

  if (speakerBtn) {
    speakerBtn.textContent =
      "🔊 Speaker";
  }

  hideAllCallOverlays();
}


// ============================================================
// PAGE CLOSE / REFRESH
// ============================================================

window.addEventListener(
  "beforeunload",
  () => {
    stopRingtone();
    stopCallTimer();

    if (localStream) {
      localStream
        .getTracks()
        .forEach(track =>
          track.stop()
        );
    }

    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (error) {
        console.warn(
          "Peer close error:",
          error
        );
      }
    }
  }
);


// ============================================================
// STARTUP LOG
// ============================================================

console.log(
  "✅ VOICE CHAT APP LOADED"
);
