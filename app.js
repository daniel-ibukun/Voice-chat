// ============================================================
// VOICE CHAT APP - COMPLETE APP.JS
// Firebase Auth + Realtime Database + WebRTC
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging.js";

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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";


// ============================================================
// FIREBASE CONFIG
// ============================================================
// KEEP YOUR EXISTING FIREBASE CONFIG VALUES HERE.
// Do not change the project to a different Firebase project.
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
// GLOBAL STATE
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
// WEBRTC CONFIGURATION
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
// SHORT DOM HELPER
// ============================================================

function $(id) {
  return document.getElementById(id);
}


// ============================================================
// AVATAR
// ============================================================

function makeAvatar(name) {
  const safeName =
    encodeURIComponent(
      name || "User"
    );

  return (
    "https://ui-avatars.com/api/?name=" +
    safeName +
    "&background=random&color=fff"
  );
}


// ============================================================
// NOTIFICATION
// ============================================================

function showNotification(message) {
  const notification =
    $("notification");

  if (!notification) {
    console.log("NOTIFICATION:", message);
    return;
  }

  notification.textContent =
    message;

  notification.classList.remove(
    "hidden"
  );

  clearTimeout(
    notification._timeout
  );

  notification._timeout =
    setTimeout(() => {
      notification.classList.add(
        "hidden"
      );
    }, 3500);
}


// ============================================================
// BROWSER NOTIFICATION
// ============================================================

async function requestNotificationPermission() {
  if (
    notificationPermissionAsked
  ) {
    return;
  }

  notificationPermissionAsked = true;

  if (
    "Notification" in window &&
    Notification.permission ===
      "default"
  ) {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn(
        "Notification permission error:",
        error
      );
    }
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
    new Notification(title, {
      body
    });
  } catch (error) {
    console.warn(
      "Browser notification error:",
      error
    );
  }
}


// ============================================================
// AUTH UI
// ============================================================

function showAuthScreen() {
  $("authSection")
    ?.classList.remove("hidden");

  $("mainSection")
    ?.classList.add("hidden");
}


function showMainScreen() {
  $("authSection")
    ?.classList.add("hidden");

  $("mainSection")
    ?.classList.remove("hidden");
}


// ============================================================
// LOGIN / REGISTER FORM SWITCHING
// ============================================================

$("showRegisterBtn")?.addEventListener(
  "click",
  () => {
    $("loginForm")
      ?.classList.add("hidden");

    $("registerForm")
      ?.classList.remove("hidden");

    $("authMessage")
      && ($("authMessage").textContent = "");
  }
);


$("showLoginBtn")?.addEventListener(
  "click",
  () => {
    $("registerForm")
      ?.classList.add("hidden");

    $("loginForm")
      ?.classList.remove("hidden");

    $("registerMessage")
      && ($("registerMessage").textContent = "");
  }
);


// ============================================================
// REGISTER
// ============================================================

$("registerBtn")?.addEventListener(
  "click",
  registerUser
);


async function registerUser(event) {
  if (event) {
    event.preventDefault();
  }

  const name =
    $("registerName")?.value.trim();

  const email =
    $("registerEmail")?.value.trim();

  const password =
    $("registerPassword")?.value;

  const confirmPassword =
    $("registerConfirmPassword")?.value;

  const message =
    $("registerMessage");

  if (!name || !email || !password) {
    if (message) {
      message.textContent =
        "Please fill in all fields.";
    }
    return;
  }

  if (
    password !==
    confirmPassword
  ) {
    if (message) {
      message.textContent =
        "Passwords do not match.";
    }
    return;
  }

  try {
    if (message) {
      message.textContent =
        "Creating account...";
    }

    const result =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await updateProfile(
      result.user,
      {
        displayName: name
      }
    );

    await set(
      ref(
        db,
        `users/${result.user.uid}`
      ),
      {
        uid: result.user.uid,
        name: name,
        email: email,
        online: true,
        createdAt: Date.now()
      }
    );

    if (message) {
      message.textContent =
        "Account created successfully!";
    }

    showNotification(
      "Account created successfully."
    );

  } catch (error) {
    console.error(
      "REGISTER ERROR:",
      error
    );

    if (message) {
      message.textContent =
        error.message ||
        "Registration failed.";
    }
  }
}


// ============================================================
// LOGIN
// ============================================================

$("loginBtn")?.addEventListener(
  "click",
  loginUser
);


async function loginUser(event) {
  if (event) {
    event.preventDefault();
  }

  const email =
    $("loginEmail")?.value.trim();

  const password =
    $("loginPassword")?.value;

  const message =
    $("authMessage");

  if (!email || !password) {
    if (message) {
      message.textContent =
        "Please enter your email and password.";
    }
    return;
  }

  try {
    if (message) {
      message.textContent =
        "Signing in...";
    }

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (message) {
      message.textContent =
        "";
    }

  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    if (message) {
      message.textContent =
        error.message ||
        "Login failed.";
    }
  }
}


// ============================================================
// LOGOUT
// ============================================================

$("logoutBtn")?.addEventListener(
  "click",
  logoutUser
);


async function logoutUser() {
  try {
    if (currentCallId) {
      await endCall();
    }

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
          "Could not update offline status:",
          error
        );
      }
    }

    stopAllListeners();

    await signOut(auth);

  } catch (error) {
    console.error(
      "LOGOUT ERROR:",
      error
    );
  }
}


// ============================================================
// AUTH STATE
// ============================================================

onAuthStateChanged(
  auth,
  async user => {
    if (!user) {
      currentUser = null;
      currentProfile = null;

      stopAllListeners();

      showAuthScreen();

      return;
    }

    currentUser = user;

    console.log(
      "LOGGED IN USER:",
      user.uid
    );

    try {
      const profileSnapshot =
        await get(
          ref(
            db,
            `users/${user.uid}`
          )
        );

      if (
        profileSnapshot.exists()
      ) {
        currentProfile =
          profileSnapshot.val();
      } else {
        currentProfile = {
          uid: user.uid,
          name:
            user.displayName ||
            user.email ||
            "User",
          email:
            user.email || ""
        };

        await set(
          ref(
            db,
            `users/${user.uid}`
          ),
          {
            ...currentProfile,
            online: true,
            createdAt: Date.now()
          }
        );
      }

      await update(
        ref(
          db,
          `users/${user.uid}`
        ),
        {
          online: true,
          lastSeen: Date.now()
        }
      );

      onDisconnect(
        ref(
          db,
          `users/${user.uid}/online`
        )
      ).set(false);

      updateMyUI();

      showMainScreen();

      requestNotificationPermission();

      listenForUsers();

      listenForIncomingCalls();

      listenForHistory();

    } catch (error) {
      console.error(
        "AUTH INITIALIZATION ERROR:",
        error
      );
    }
  }
);


// ============================================================
// UPDATE MY UI
// ============================================================

function updateMyUI() {
  if (!currentUser) {
    return;
  }

  const name =
    currentProfile?.name ||
    currentUser.displayName ||
    currentUser.email ||
    "User";

  const avatar =
    $("myAvatar");

  if (avatar) {
    avatar.src =
      makeAvatar(name);

    avatar.alt =
      name;
  }

  const welcome =
    $("welcomeText");

  if (welcome) {
    welcome.textContent =
      `Welcome, ${name}`;
  }
}


// ============================================================
// LIST USERS
// ============================================================

function listenForUsers() {
  if (usersUnsubscribe) {
    try {
      usersUnsubscribe();
    } catch (error) {
      console.warn(
        "Users listener cleanup error:",
        error
      );
    }

    usersUnsubscribe = null;
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
        if (!snapshot.exists()) {
          renderUsers({});
          return;
        }

        const users =
          snapshot.val();

        userCache = users || {};

        renderUsers(users);
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
// RENDER USERS
// ============================================================

function renderUsers(users) {
  const container =
    $("usersList");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  Object.entries(users || {})
    .forEach(
      ([uid, user]) => {
        if (
          uid === currentUser?.uid
        ) {
          return;
        }

        const name =
          user.name ||
          user.email ||
          "User";

        const email =
          user.email || "";

        const item =
          document.createElement(
            "div"
          );

        item.className =
          "user-item";

        const avatar =
          document.createElement(
            "img"
          );

        avatar.src =
          makeAvatar(name);

        avatar.alt =
          name;

        const info =
          document.createElement(
            "div"
          );

        info.className =
          "user-info";

        const nameElement =
          document.createElement(
            "div"
          );

        nameElement.className =
          "user-name";

        nameElement.textContent =
          name;

        const emailElement =
          document.createElement(
            "div"
          );

        emailElement.className =
          "user-email";

        emailElement.textContent =
          email;

        const status =
          document.createElement(
            "div"
          );

        status.className =
          "user-status";

        status.textContent =
          user.online
            ? "🟢 Online"
            : "⚪ Offline";

        const callButton =
          document.createElement(
            "button"
          );

        callButton.textContent =
          "📞 Call";

        callButton.addEventListener(
          "click",
          () => {
            startCall({
              uid,
              name,
              email
            });
          }
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
          status
        );

        item.appendChild(
          avatar
        );

        item.appendChild(
          info
        );

        item.appendChild(
          callButton
        );

        container.appendChild(
          item
        );
      }
    );
}


// ============================================================
// INCOMING CALL LISTENER
// ============================================================
// IMPORTANT:
// Uses onValue so an incoming ringing call is found even if
// the listener starts after the call was created.
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

    incomingCallsUnsubscribe =
      null;
  }

  if (!currentUser) {
    console.warn(
      "INCOMING CALL LISTENER: No logged-in user."
    );

    return;
  }

  console.log(
    "📞 INCOMING CALL LISTENER STARTED FOR:",
    currentUser.uid
  );

  const callsRef =
    ref(db, "calls");

  incomingCallsUnsubscribe =
    onValue(
      callsRef,
      snapshot => {
        console.log(
          "CALLS DATABASE UPDATED"
        );

        if (!snapshot.exists()) {
          return;
        }

        const calls =
          snapshot.val();

        Object.entries(calls)
          .forEach(
            ([callId, call]) => {
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

              if (currentCallId) {
                return;
              }

              if (
                pendingIncomingCall &&
                pendingIncomingCall.id ===
                  callId
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
          "Could not listen for incoming calls."
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
  if (!call) {
    return;
  }

  pendingIncomingCall = {
    id: callId,
    data: call
  };

  const name =
    call.callerName ||
    call.callerEmail ||
    "User";

  const email =
    call.callerEmail ||
    "";

  const avatar =
    $("incomingCallerAvatar");

  const nameElement =
    $("incomingCallerName");

  const emailElement =
    $("incomingCallerEmail");

  const overlay =
    $("incomingCallOverlay");

  if (avatar) {
    avatar.src =
      makeAvatar(name);

    avatar.alt =
      name;
  }

  if (nameElement) {
    nameElement.textContent =
      name;
  }

  if (emailElement) {
    emailElement.textContent =
      email;
  }

  overlay?.classList.remove(
    "hidden"
  );

  startRingtone();

  sendBrowserNotification(
    "Incoming voice call",
    `${name} is calling you.`
  );

  console.log(
    "📞 SHOWING INCOMING CALL:",
    name
  );
}


// ============================================================
// ACCEPT CALL BUTTON
// ============================================================

$("acceptCallBtn")?.addEventListener(
  "click",
  acceptCall
);


// ============================================================
// ACCEPT CALL
// ============================================================

async function acceptCall() {
  if (!pendingIncomingCall) {
    return;
  }

  const callId =
    pendingIncomingCall.id;

  const call =
    pendingIncomingCall.data;

  if (!call) {
    return;
  }

  try {
    stopRingtone();

    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: false
        });

    currentCallId =
      callId;

    currentCallRole =
      "callee";

    currentRemoteUser = {
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

    createPeerConnection();

    await peerConnection
      .setRemoteDescription(
        new RTCSessionDescription(
          call.offer
        )
      );

    listenForCallerCandidates(
      callId
    );

    await addPendingRemoteCandidates();

    const answer =
      await peerConnection
        .createAnswer();

    await peerConnection
      .setLocalDescription(
        answer
      );

    await update(
      ref(
        db,
        `calls/${callId}`
      ),
      {
        answer: {
          type:
            answer.type,
          sdp:
            answer.sdp
        },

        status:
          "accepted",

        startedAt:
          Date.now()
      }
    );

    pendingIncomingCall =
      null;

    showActiveCall();

    startCallTimer();

    listenForActiveCallChanges(
      callId
    );

    updateCallStatus(
      "Connected"
    );

  } catch (error) {
    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    showNotification(
      "Could not accept the call."
    );

    if (currentCallId) {
      try {
        await update(
          ref(
            db,
            `calls/${currentCallId}`
          ),
          {
            status: "failed",
            endedAt: Date.now()
          }
        );
      } catch (updateError) {
        console.error(
          "FAILED CALL UPDATE ERROR:",
          updateError
        );
      }
    }

    await cleanupCall(
      false
    );
  }
}


// ============================================================
// REJECT CALL BUTTON
// ============================================================

$("rejectCallBtn")?.addEventListener(
  "click",
  rejectCall
);


// ============================================================
// REJECT CALL
// ============================================================

async function rejectCall() {
  if (!pendingIncomingCall) {
    return;
  }

  const callId =
    pendingIncomingCall.id;

  const call =
    pendingIncomingCall.data;

  try {
    stopRingtone();

    await update(
      ref(
        db,
        `calls/${callId}`
      ),
      {
        status:
          "rejected",

        endedAt:
          Date.now()
      }
    );

    await saveMyHistory(
      callId,
      "rejected",
      0,
      call
    );

    pendingIncomingCall =
      null;

    $("incomingCallOverlay")
      ?.classList.add(
        "hidden"
      );

    showNotification(
      "Call rejected."
    );

  } catch (error) {
    console.error(
      "REJECT CALL ERROR:",
      error
    );
  }
}


// ============================================================
// START CALL
// ============================================================

async function startCall(user) {
  if (!currentUser) {
    showNotification(
      "Please log in first."
    );

    return;
  }

  if (!user || !user.uid) {
    showNotification(
      "Invalid user."
    );

    return;
  }

  if (
    user.uid ===
    currentUser.uid
  ) {
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
    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: false
        });

    const callRef =
      push(
        ref(db, "calls")
      );

    const callId =
      callRef.key;

    if (!callId) {
      throw new Error(
        "Could not create call ID."
      );
    }

    currentCallId =
      callId;

    currentCallRole =
      "caller";

    currentRemoteUser = {
      uid:
        user.uid,

      name:
        user.name ||
        user.email ||
        "User",

      email:
        user.email || ""
    };

    createPeerConnection();

    const offer =
      await peerConnection
        .createOffer();

    await peerConnection
      .setLocalDescription(
        offer
      );

    const callerName =
      currentProfile?.name ||
      currentUser.displayName ||
      currentUser.email ||
      "User";

    const callerEmail =
      currentUser.email ||
      "";

    const callData = {
      callerId:
        currentUser.uid,

      calleeId:
        user.uid,

      callerName:
        callerName,

      callerEmail:
        callerEmail,

      calleeName:
        user.name ||
        user.email ||
        "User",

      calleeEmail:
        user.email ||
        "",

      status:
        "ringing",

      offer: {
        type:
          offer.type,

        sdp:
          offer.sdp
      },

      createdAt:
        Date.now()
    };

    await set(
      callRef,
      callData
    );

    showOutgoingCall(
      user
    );

    startRingtone();

    listenForCalleeCandidates(
      callId
    );

    listenForOutgoingCallChanges(
      callId
    );

    console.log(
      "📞 CALL STARTED:",
      callId,
      callData
    );

  } catch (error) {
    console.error(
      "START CALL ERROR:",
      error
    );

    showNotification(
      "Could not start the call."
    );

    await cleanupCall(
      false
    );
  }
}


// ============================================================
// CREATE PEER CONNECTION
// ============================================================

function createPeerConnection() {
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch (error) {
      console.warn(
        "Existing peer close error:",
        error
      );
    }
  }

  peerConnection =
    new RTCPeerConnection(
      rtcConfiguration
    );

  pendingRemoteCandidates =
    [];

  if (localStream) {
    localStream
      .getTracks()
      .forEach(
        track => {
          peerConnection.addTrack(
            track,
            localStream
          );
        }
      );
  }

  peerConnection.ontrack =
    event => {
      const remoteAudio =
        $("remoteAudio");

      if (!remoteAudio) {
        return;
      }

      if (
        event.streams &&
        event.streams[0]
      ) {
        remoteAudio.srcObject =
          event.streams[0];

        remoteAudio
          .play()
          .catch(error => {
            console.warn(
              "Remote audio autoplay error:",
              error
            );
          });
      }
    };

  peerConnection.onconnectionstatechange =
    () => {
      if (!peerConnection) {
        return;
      }

      const state =
        peerConnection
          .connectionState;

      console.log(
        "WEBRTC CONNECTION STATE:",
        state
      );

      if (
        state ===
        "connected"
      ) {
        updateCallStatus(
          "Connected"
        );
      }

      if (
        state ===
        "connecting"
      ) {
        updateCallStatus(
          "Connecting..."
        );
      }

      if (
        state ===
        "disconnected"
      ) {
        updateCallStatus(
          "Connection interrupted..."
        );
      }

      if (
        state ===
        "failed"
      ) {
        updateCallStatus(
          "Connection failed"
        );
      }
    };

  peerConnection.oniceconnectionstatechange =
    () => {
      if (!peerConnection) {
        return;
      }

      console.log(
        "ICE CONNECTION STATE:",
        peerConnection
          .iceConnectionState
      );
    };

  peerConnection.onicecandidate =
    async event => {
      if (
        !event.candidate ||
        !currentCallId
      ) {
        return;
      }

      const path =
        currentCallRole ===
        "caller"
          ? `calls/${currentCallId}/callerCandidates`
          : `calls/${currentCallId}/calleeCandidates`;

      try {
        await push(
          ref(db, path),
          event.candidate.toJSON()
        );
      } catch (error) {
        console.error(
          "SAVE ICE CANDIDATE ERROR:",
          error
        );
      }
    };
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

        if (!candidate) {
          return;
        }

        if (!peerConnection) {
          pendingRemoteCandidates.push(
            candidate
          );

          return;
        }

        try {
          await peerConnection
            .addIceCandidate(
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

        if (!candidate) {
          return;
        }

        if (!peerConnection) {
          pendingRemoteCandidates.push(
            candidate
          );

          return;
        }

        try {
          await peerConnection
            .addIceCandidate(
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

  pendingRemoteCandidates =
    [];

  for (
    const candidate of candidates
  ) {
    try {
      await peerConnection
        .addIceCandidate(
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
    ref(
      db,
      `calls/${callId}`
    );

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

        // ACCEPTED
        if (
          call.status ===
          "accepted"
        ) {
          stopRingtone();

          if (
            call.answer &&
            peerConnection &&
            !peerConnection
              .currentRemoteDescription
          ) {
            try {
              await peerConnection
                .setRemoteDescription(
                  new RTCSessionDescription(
                    call.answer
                  )
                );

              await addPendingRemoteCandidates();

              showActiveCall();

              startCallTimer();

              updateCallStatus(
                "Connected"
              );

            } catch (error) {
              console.error(
                "SET REMOTE ANSWER ERROR:",
                error
              );
            }
          }
        }

        // REJECTED
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

        // CANCELLED
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

        // ENDED
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

        // FAILED
        if (
          call.status ===
          "failed"
        ) {
          stopRingtone();

          await saveMyHistory(
            callId,
            "failed",
            getCallDuration(),
            call
          );

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
    ref(
      db,
      `calls/${callId}`
    );

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

          return;
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

          return;
        }

        if (
          call.status ===
          "failed"
        ) {
          await saveMyHistory(
            callId,
            "failed",
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
// CANCEL OUTGOING CALL BUTTON
// ============================================================

$("cancelCallBtn")?.addEventListener(
  "click",
  cancelOutgoingCall
);


// ============================================================
// CANCEL OUTGOING CALL
// ============================================================

async function cancelOutgoingCall() {
  if (!currentCallId) {
    return;
  }

  const callId =
    currentCallId;

  let call = null;

  try {
    const beforeSnapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    if (
      beforeSnapshot.exists()
    ) {
      call =
        beforeSnapshot.val();
    }

    await update(
      ref(
        db,
        `calls/${callId}`
      ),
      {
        status:
          "cancelled",

        endedAt:
          Date.now()
      }
    );

    const snapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    if (
      snapshot.exists()
    ) {
      call =
        snapshot.val();
    }

    await saveMyHistory(
      callId,
      "cancelled",
      0,
      call
    );

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
    ?.classList.add(
      "hidden"
    );

  $("incomingCallOverlay")
    ?.classList.add(
      "hidden"
    );

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
      makeAvatar(
        remoteName
      );

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
    setInterval(
      () => {
        const elapsed =
          Math.floor(
            (
              Date.now() -
              callStartTime
            ) / 1000
          );

        const minutes =
          Math.floor(
            elapsed / 60
          );

        const seconds =
          elapsed % 60;

        if (timer) {
          timer.textContent =
            String(
              minutes
            ).padStart(
              2,
              "0"
            ) +
            ":" +
            String(
              seconds
            ).padStart(
              2,
              "0"
            );
        }
      },
      1000
    );
}


function stopCallTimer() {
  if (
    callTimerInterval
  ) {
    clearInterval(
      callTimerInterval
    );

    callTimerInterval =
      null;
  }
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


// ============================================================
// MUTE
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
        track => {
          track.enabled =
            !isMuted;
        }
      );

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
// END CALL BUTTON
// ============================================================

$("endCallBtn")?.addEventListener(
  "click",
  endCall
);


// ============================================================
// END CALL
// ============================================================

async function endCall() {
  if (!currentCallId) {
    await cleanupCall(
      false
    );

    return;
  }

  const callId =
    currentCallId;

  let call = null;

  try {
    const beforeSnapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    if (
      beforeSnapshot.exists()
    ) {
      call =
        beforeSnapshot.val();
    }

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

    const snapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    if (
      snapshot.exists()
    ) {
      call =
        snapshot.val();
    }

    await saveMyHistory(
      callId,
      "ended",
      getCallDuration(),
      call
    );

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

  // Current user is caller
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

  // Current user is callee
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
// SAVE CALL HISTORY
// ============================================================
// IMPORTANT:
// Uses callHistory/{userId}/{callId}
// instead of the old history/{userId} path.
// ============================================================

async function saveMyHistory(
  callId,
  status,
  duration = 0,
  call = null
) {
  if (!currentUser) {
    console.warn(
      "Cannot save history: no logged-in user."
    );

    return;
  }

  if (!callId) {
    console.warn(
      "Cannot save history: no call ID."
    );

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
      ref(
        db,
        `callHistory/${currentUser.uid}/${callId}`
      );

    const historyData = {
      callId:
        callId,

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

      timestamp:
        Date.now()
    };

    await set(
      historyRef,
      historyData
    );

    console.log(
      "✅ CALL HISTORY SAVED:",
      historyData
    );

  } catch (error) {
    console.error(
      "❌ SAVE HISTORY ERROR:",
      error
    );
  }
}


// ============================================================
// LISTEN FOR HISTORY
// ============================================================

function listenForHistory() {
  if (historyUnsubscribe) {
    try {
      historyUnsubscribe();
    } catch (error) {
      console.warn(
        "History listener cleanup error:",
        error
      );
    }

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

  console.log(
    "📚 HISTORY LISTENER STARTED FOR:",
    currentUser.uid
  );

  historyUnsubscribe =
    onValue(
      historyRef,
      snapshot => {
        console.log(
          "📚 CALL HISTORY UPDATED"
        );

        renderHistory(
          snapshot
        );
      },
      error => {
        console.error(
          "❌ HISTORY LISTENER ERROR:",
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
  const container =
    $("historyList") ||
    $("callHistory") ||
    $("history");

  if (!container) {
    console.warn(
      "No history container found."
    );

    return;
  }

  container.innerHTML =
    "";

  if (!snapshot.exists()) {
    container.innerHTML =
      "<p>No call history yet.</p>";

    return;
  }

  const history =
    snapshot.val();

  const entries =
    Object.entries(
      history
    )
      .map(
        ([id, item]) => ({
          id,
          ...item
        })
      )
      .sort(
        (a, b) =>
          (b.timestamp || 0) -
          (a.timestamp || 0)
      );

  entries.forEach(
    item => {
      const name =
        item.remoteName ||
        item.remoteEmail ||
        "User";

      const email =
        item.remoteEmail ||
        "";

      const element =
        document.createElement(
          "div"
        );

      element.className =
        "history-item";

      const avatar =
        document.createElement(
          "img"
        );

      avatar.src =
        makeAvatar(name);

      avatar.alt =
        name;

      const info =
        document.createElement(
          "div"
        );

      info.className =
        "history-info";

      const nameElement =
        document.createElement(
          "div"
        );

      nameElement.className =
        "history-name";

      nameElement.textContent =
        name;

      const emailElement =
        document.createElement(
          "div"
        );

      emailElement.className =
        "history-email";

      emailElement.textContent =
        email;

      const statusElement =
        document.createElement(
          "div"
        );

      statusElement.className =
        "history-status";

      statusElement.textContent =
        formatHistoryStatus(
          item.status
        );

      const durationElement =
        document.createElement(
          "div"
        );

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
    }
  );
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
    String(
      minutes
    ).padStart(
      2,
      "0"
    ) +
    ":" +
    String(
      remaining
    ).padStart(
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
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    ringtoneContext =
      new AudioContext();

    const playTone =
      () => {
        if (
          !ringtoneContext
        ) {
          return;
        }

        const oscillator =
          ringtoneContext
            .createOscillator();

        const gain =
          ringtoneContext
            .createGain();

        oscillator.type =
          "sine";

        oscillator.frequency.value =
          700;

        gain.gain.setValueAtTime(
          0.0001,
          ringtoneContext.currentTime
        );

        gain.gain
          .exponentialRampToValueAtTime(
            0.15,
            ringtoneContext.currentTime +
              0.03
          );

        gain.gain
          .exponentialRampToValueAtTime(
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

    ringtoneTimer =
      null;
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

    ringtoneContext =
      null;
  }
}


// ============================================================
// HIDE ALL CALL OVERLAYS
// ============================================================

function hideAllCallOverlays() {
  $("incomingCallOverlay")
    ?.classList.add(
      "hidden"
    );

  $("outgoingCallOverlay")
    ?.classList.add(
      "hidden"
    );

  $("callOverlay")
    ?.classList.add(
      "hidden"
    );
}


// ============================================================
// STOP ALL LISTENERS
// ============================================================

function stopAllListeners() {
  if (usersUnsubscribe) {
    try {
      usersUnsubscribe();
    } catch (error) {
      console.warn(
        "Users listener cleanup error:",
        error
      );
    }

    usersUnsubscribe =
      null;
  }

  if (incomingCallsUnsubscribe) {
    try {
      incomingCallsUnsubscribe();
    } catch (error) {
      console.warn(
        "Incoming listener cleanup error:",
        error
      );
    }

    incomingCallsUnsubscribe =
      null;
  }

  if (historyUnsubscribe) {
    try {
      historyUnsubscribe();
    } catch (error) {
      console.warn(
        "History listener cleanup error:",
        error
      );
    }

    historyUnsubscribe =
      null;
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

  callUnsubscribers =
    [];
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

  callUnsubscribers =
    [];

  if (localStream) {
    localStream
      .getTracks()
      .forEach(
        track => {
          try {
            track.stop();
          } catch (error) {
            console.warn(
              "TRACK STOP ERROR:",
              error
            );
          }
        }
      );

    localStream =
      null;
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

    peerConnection =
      null;
  }

  const remoteAudio =
    $("remoteAudio");

  if (remoteAudio) {
    remoteAudio.srcObject =
      null;
  }

  currentCallId =
    null;

  currentCallRole =
    null;

  currentRemoteUser =
    null;

  pendingIncomingCall =
    null;

  pendingRemoteCandidates =
    [];

  callStartTime =
    null;

  isMuted =
    false;

  isSpeakerOn =
    true;

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
        .forEach(
          track => {
            try {
              track.stop();
            } catch (error) {
              console.warn(
                "Track stop error:",
                error
              );
            }
          }
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
