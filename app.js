// ============================================================
// VOICE CHAT APP - COMPLETE APP.JS
// Firebase Auth + Realtime Database + WebRTC + FCM
// ============================================================

// ============================================================
// FIREBASE IMPORTS
// ============================================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  onChildAdded,
  onDisconnect
} from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

import {
  getMessaging,
  getToken,
  onMessage
} from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging.js";


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

let messaging = null;

try {
  if (
    "serviceWorker" in navigator &&
    "Notification" in window
  ) {
    messaging = getMessaging(app);
  }
} catch (error) {
  console.warn(
    "Firebase Messaging could not initialize:",
    error
  );
}


// ============================================================
// FCM / VAPID
// ============================================================

// Paste the VAPID public key you already generated.
const VAPID_KEY =  "BFhU6C-xoaa9VLZopXwHVADPWqSWxlKaYkCvvK3HaQ0RIImUVFKg5aYpIq2L5Odmd73Cf895Se1zdT9PPmQz-cE";


let messagingServiceWorkerRegistration = null;


// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser = null;

let currentCallId = null;
let currentCallRole = null;
let currentRemoteUser = null;

let localStream = null;
let peerConnection = null;

let pendingIncomingCall = null;
let pendingRemoteCandidates = [];

let callStartTime = null;
let callTimerInterval = null;

let isMuted = false;
let isSpeakerOn = true;

let ringtoneContext = null;
let ringtoneTimer = null;

let usersUnsubscribe = null;
let incomingCallsUnsubscribe = null;
let historyUnsubscribe = null;

let callUnsubscribers = [];


// ============================================================
// WEBRTC CONFIG
// ============================================================

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    },
    {
      urls: "stun:stun2.l.google.com:19302"
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

function makeAvatar(name) {
  const safeName =
    encodeURIComponent(
      String(name || "User").trim() || "User"
    );

  return (
    `https://ui-avatars.com/api/?name=${safeName}` +
    `&background=random&color=fff`
  );
}


// ============================================================
// APP NOTIFICATION
// ============================================================

function showNotification(message) {
  const notification = $("notification");

  if (!notification) {
    console.log("NOTIFICATION:", message);
    return;
  }

  notification.textContent = message;

  notification.classList.remove("hidden");

  clearTimeout(notification._timeout);

  notification._timeout =
    setTimeout(() => {
      notification.classList.add("hidden");
    }, 4000);
}


// ============================================================
// BROWSER NOTIFICATION
// ============================================================

function sendBrowserNotification(title, body) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  try {
    new Notification(title, {
      body,
      icon: makeAvatar(title)
    });
  } catch (error) {
    console.warn(
      "Browser notification error:",
      error
    );
  }
}


// ============================================================
// REGISTER FCM TOKEN
// ============================================================

async function registerFCMToken() {
  if (
    !currentUser ||
    !messaging ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window)
  ) {
    return;
  }

  try {
    if (!VAPID_KEY ||
        VAPID_KEY ===
        "PASTE_YOUR_EXISTING_VAPID_PUBLIC_KEY_HERE") {
      console.warn(
        "VAPID key has not been added yet."
      );
      return;
    }

    messagingServiceWorkerRegistration =
      await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
      );

    console.log(
      "Firebase messaging service worker registered."
    );

    if (Notification.permission !== "granted") {
      console.log(
        "Notification permission is not granted."
      );
      return;
    }

    const token = await getToken(
      messaging,
      {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration:
          messagingServiceWorkerRegistration
      }
    );

    if (!token) {
      console.warn(
        "No FCM token was returned."
      );
      return;
    }

    await update(
      ref(
        db,
        `users/${currentUser.uid}`
      ),
      {
        fcmToken: token,
        fcmTokenUpdatedAt: Date.now()
      }
    );

    console.log(
      "FCM TOKEN REGISTERED."
    );

  } catch (error) {
    console.error(
      "FCM TOKEN ERROR:",
      error
    );
  }
}


// ============================================================
// REQUEST NOTIFICATION PERMISSION
// ============================================================

async function requestNotificationPermission() {
  if (
    !("Notification" in window)
  ) {
    return;
  }

  try {
    if (
      Notification.permission === "default"
    ) {
      const permission =
        await Notification.requestPermission();

      console.log(
        "Notification permission:",
        permission
      );
    }

    if (
      Notification.permission === "granted"
    ) {
      await registerFCMToken();
    }

  } catch (error) {
    console.warn(
      "Notification permission error:",
      error
    );
  }
}


// ============================================================
// FOREGROUND FCM MESSAGE
// ============================================================

if (messaging) {
  onMessage(
    messaging,
    payload => {
      console.log(
        "FOREGROUND FCM MESSAGE:",
        payload
      );

      const notification =
        payload.notification || {};

      const data =
        payload.data || {};

      const title =
        notification.title ||
        data.title ||
        "Incoming call";

      const body =
        notification.body ||
        data.body ||
        "Someone is calling you.";

      showNotification(
        `${title}: ${body}`
      );

      sendBrowserNotification(
        title,
        body
      );
    }
  );
}


// ============================================================
// AUTH UI
// ============================================================

function showAuthUI() {
  $("authSection")?.classList.remove(
    "hidden"
  );

  $("mainSection")?.classList.add(
    "hidden"
  );
}


function showMainUI() {
  $("authSection")?.classList.add(
    "hidden"
  );

  $("mainSection")?.classList.remove(
    "hidden"
  );
}


// ============================================================
// REGISTER / LOGIN FORM SWITCHING
// ============================================================

$("showRegisterBtn")?.addEventListener(
  "click",
  () => {
    $("loginForm")?.classList.add(
      "hidden"
    );

    $("registerForm")?.classList.remove(
      "hidden"
    );

    if ($("authMessage")) {
      $("authMessage").textContent = "";
    }

    if ($("registerMessage")) {
      $("registerMessage").textContent = "";
    }
  }
);


$("showLoginBtn")?.addEventListener(
  "click",
  () => {
    $("registerForm")?.classList.add(
      "hidden"
    );

    $("loginForm")?.classList.remove(
      "hidden"
    );

    if ($("authMessage")) {
      $("authMessage").textContent = "";
    }

    if ($("registerMessage")) {
      $("registerMessage").textContent = "";
    }
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
  event?.preventDefault();

  const name =
    $("registerName")?.value.trim() || "";

  const email =
    $("registerEmail")?.value.trim() || "";

  const password =
    $("registerPassword")?.value || "";

  const confirmPassword =
    $("registerConfirmPassword")?.value || "";

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
    password !== confirmPassword
  ) {
    if (message) {
      message.textContent =
        "Passwords do not match.";
    }

    return;
  }

  if (password.length < 6) {
    if (message) {
      message.textContent =
        "Password must be at least 6 characters.";
    }

    return;
  }

  try {
    if (message) {
      message.textContent =
        "Creating account...";
    }

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await updateProfile(
      credential.user,
      {
        displayName: name
      }
    );

    await set(
      ref(
        db,
        `users/${credential.user.uid}`
      ),
      {
        uid:
          credential.user.uid,

        name,

        email,

        online: true,

        lastSeen:
          Date.now()
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
  event?.preventDefault();

  const email =
    $("loginEmail")?.value.trim() || "";

  const password =
    $("loginPassword")?.value || "";

  const message =
    $("authMessage");

  if (!email || !password) {
    if (message) {
      message.textContent =
        "Enter your email and password.";
    }

    return;
  }

  try {
    if (message) {
      message.textContent =
        "Logging in...";
    }

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (message) {
      message.textContent = "";
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
    currentUser = user;

    if (!user) {
      stopAllListeners();

      hideAllCallOverlays();

      showAuthUI();

      return;
    }

    showMainUI();

    await updateMyUI();

    listenForUsers();

    listenForIncomingCalls();

    listenForHistory();

    try {
      await update(
        ref(
          db,
          `users/${user.uid}`
        ),
        {
          uid: user.uid,

          name:
            user.displayName ||
            user.email ||
            "User",

          email:
            user.email ||
            "",

          online: true,

          lastSeen:
            Date.now()
        }
      );

      onDisconnect(
        ref(
          db,
          `users/${user.uid}/online`
        )
      ).set(false);

    } catch (error) {
      console.error(
        "USER ONLINE ERROR:",
        error
      );
    }
  }
);


// ============================================================
// UPDATE MY UI
// ============================================================

async function updateMyUI() {
  if (!currentUser) {
    return;
  }

  const name =
    currentUser.displayName ||
    currentUser.email ||
    "User";

  const welcome =
    $("welcomeText");

  if (welcome) {
    welcome.textContent =
      `Welcome, ${name}`;
  }

  const avatar =
    $("myAvatar");

  if (avatar) {
    avatar.src =
      makeAvatar(name);

    avatar.alt =
      name;
  }
}


// ============================================================
// LISTEN FOR USERS
// ============================================================

function listenForUsers() {
  if (usersUnsubscribe) {
    usersUnsubscribe();

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
        renderUsers(snapshot);
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

function renderUsers(snapshot) {
  const container =
    $("usersList");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!snapshot.exists()) {
    container.innerHTML =
      "<p>No users found.</p>";

    return;
  }

  const users =
    snapshot.val();

  Object.entries(users).forEach(
    ([uid, user]) => {
      if (
        !currentUser ||
        uid === currentUser.uid
      ) {
        return;
      }

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
        document.createElement(
          "div"
        );

      info.className =
        "user-info";

      const name =
        document.createElement(
          "div"
        );

      name.className =
        "user-name";

      name.textContent =
        user.name ||
        user.email ||
        "User";

      const email =
        document.createElement(
          "div"
        );

      email.className =
        "user-email";

      email.textContent =
        user.email ||
        "";

      const button =
        document.createElement(
          "button"
        );

      button.className =
        "call-user-btn";

      button.textContent =
        "📞 Call";

      button.addEventListener(
        "click",
        () => {
          startCall({
            uid,

            name:
              user.name ||
              user.email ||
              "User",

            email:
              user.email ||
              ""
          });
        }
      );

      info.appendChild(name);

      if (user.email) {
        info.appendChild(email);
      }

      item.appendChild(avatar);

      item.appendChild(info);

      item.appendChild(button);

      container.appendChild(item);
    }
  );
}


// ============================================================
// INCOMING CALL LISTENER
// ============================================================

function listenForIncomingCalls() {
  if (incomingCallsUnsubscribe) {
    incomingCallsUnsubscribe();

    incomingCallsUnsubscribe = null;
  }

  if (!currentUser) {
    return;
  }

  const callsRef =
    ref(db, "calls");

  incomingCallsUnsubscribe =
    onValue(
      callsRef,
      snapshot => {
        if (!snapshot.exists()) {
          return;
        }

        const calls =
          snapshot.val();

        Object.entries(calls).forEach(
          ([callId, call]) => {
            if (
              !call ||
              call.calleeId !==
                currentUser.uid ||
              call.status !==
                "ringing"
            ) {
              return;
            }

            if (
              currentCallId ||
              pendingIncomingCall
            ) {
              return;
            }

            pendingIncomingCall = {
              callId,
              ...call
            };

            currentCallId =
              callId;

            currentCallRole =
              "callee";

            currentRemoteUser = {
              uid:
                call.callerId ||
                "",

              name:
                call.callerName ||
                call.callerEmail ||
                "User",

              email:
                call.callerEmail ||
                ""
            };

            showIncomingCall(call);

            sendBrowserNotification(
              "Incoming voice call",
              `${currentRemoteUser.name} is calling you.`
            );

            startRingtone();

            listenForActiveCallChanges(
              callId
            );
          }
        );
      },
      error => {
        console.error(
          "INCOMING CALL LISTENER ERROR:",
          error
        );
      }
    );
}


// ============================================================
// SHOW INCOMING CALL
// ============================================================

function showIncomingCall(call) {
  const overlay =
    $("incomingCallOverlay");

  const avatar =
    $("incomingCallerAvatar");

  const name =
    $("incomingCallerName");

  const callerName =
    call.callerName ||
    call.callerEmail ||
    "User";

  if (avatar) {
    avatar.src =
      makeAvatar(callerName);

    avatar.alt =
      callerName;
  }

  if (name) {
    name.textContent =
      callerName;
  }

  $("ringingIndicator")
    ?.classList.remove(
      "hidden"
    );

  overlay?.classList.remove(
    "hidden"
  );
}


// ============================================================
// ACCEPT CALL
// ============================================================

$("acceptCallBtn")?.addEventListener(
  "click",
  acceptCall
);


async function acceptCall() {
  if (
    !pendingIncomingCall ||
    !currentCallId
  ) {
    return;
  }

  const callId =
    currentCallId;

  try {
    stopRingtone();

    const snapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    if (!snapshot.exists()) {
      await cleanupCall(false);
      return;
    }

    const call =
      snapshot.val();

    if (call.status !== "ringing") {
      showNotification(
        "This call is no longer available."
      );

      await cleanupCall(false);
      return;
    }

    currentCallRole =
      "callee";

    currentRemoteUser = {
      uid:
        call.callerId ||
        "",

      name:
        call.callerName ||
        call.callerEmail ||
        "User",

      email:
        call.callerEmail ||
        ""
    };

    await startLocalAudio();

    createPeerConnection();

    if (call.offer) {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(
          call.offer
        )
      );

      await addPendingRemoteCandidates();

      const answer =
        await peerConnection.createAnswer();

      await peerConnection.setLocalDescription(
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

          acceptedAt:
            Date.now()
        }
      );
    }

    listenForCallerCandidates(
      callId
    );

    listenForActiveCallChanges(
      callId
    );

    showActiveCall();

    updateCallStatus(
      "Connecting..."
    );

  } catch (error) {
    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    showNotification(
      "Could not answer the call."
    );

    try {
      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {
          status:
            "failed",

          endedAt:
            Date.now()
        }
      );
    } catch (_) {}

    await cleanupCall(false);
  }
}


// ============================================================
// REJECT CALL
// ============================================================

$("rejectCallBtn")?.addEventListener(
  "click",
  rejectCall
);


async function rejectCall() {
  if (!currentCallId) {
    return;
  }

  const callId =
    currentCallId;

  let call = null;

  try {
    stopRingtone();

    const snapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    if (snapshot.exists()) {
      call =
        snapshot.val();
    }

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

  } catch (error) {
    console.error(
      "REJECT CALL ERROR:",
      error
    );
  }

  await cleanupCall(false);
}


// ============================================================
// START CALL
// ============================================================

async function startCall(user) {
  if (
    !currentUser ||
    !user ||
    !user.uid
  ) {
    return;
  }

  if (currentCallId) {
    showNotification(
      "You are already in a call."
    );

    return;
  }

  try {
    await startLocalAudio();

    const callRef =
      push(ref(db, "calls"));

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
        user.email ||
        ""
    };

    createPeerConnection();

    const offer =
      await peerConnection.createOffer({
        offerToReceiveAudio: true
      });

    await peerConnection.setLocalDescription(
      offer
    );

    const callData = {
      callerId:
        currentUser.uid,

      callerName:
        currentUser.displayName ||
        currentUser.email ||
        "User",

      callerEmail:
        currentUser.email ||
        "",

      calleeId:
        user.uid,

      calleeName:
        user.name ||
        user.email ||
        "User",

      calleeEmail:
        user.email ||
        "",

      type:
        "voice",

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

    listenForOutgoingCallChanges(
      callId
    );

    listenForCalleeCandidates(
      callId
    );

    listenForActiveCallChanges(
      callId
    );

  } catch (error) {
    console.error(
      "START CALL ERROR:",
      error
    );

    showNotification(
      "Could not start the call."
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
              "failed",

            endedAt:
              Date.now()
          }
        );
      } catch (_) {}
    }

    await cleanupCall(false);
  }
}


// ============================================================
// START LOCAL AUDIO
// ============================================================

async function startLocalAudio() {
  if (localStream) {
    return localStream;
  }
// ============================================================
// GET CALL DURATION
// ============================================================

function getCallDuration() {
  if (!callStartTime) {
    return 0;
  }

  return Math.floor((Date.now() - callStartTime) / 1000);
}


// ============================================================
// MUTE
// ============================================================

$("muteBtn")?.addEventListener("click", () => {
  if (!localStream) {
    return;
  }

  isMuted = !isMuted;

  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  const button = $("muteBtn");

  if (button) {
    button.textContent = isMuted
      ? "🔇 Unmute"
      : "🎤 Mute";
  }
});


// ============================================================
// SPEAKER
// ============================================================

$("speakerBtn")?.addEventListener("click", () => {
  const audio = $("remoteAudio");

  if (!audio) {
    return;
  }

  isSpeakerOn = !isSpeakerOn;

  audio.muted = !isSpeakerOn;

  const button = $("speakerBtn");

  if (button) {
    button.textContent = isSpeakerOn
      ? "🔊 Speaker"
      : "🔇 Speaker";
  }
});


// ============================================================
// END CALL BUTTON
// ============================================================

$("endCallBtn")?.addEventListener("click", endCall);


// ============================================================
// END CALL
// ============================================================

async function endCall() {
  if (!currentCallId) {
    await cleanupCall(false);
    return;
  }

  const callId = currentCallId;
  let call = null;

  try {
    const beforeSnapshot = await get(
      ref(db, `calls/${callId}`)
    );

    if (beforeSnapshot.exists()) {
      call = beforeSnapshot.val();
    }

    await update(
      ref(db, `calls/${callId}`),
      {
        status: "ended",
        endedAt: Date.now()
      }
    );

    const snapshot = await get(
      ref(db, `calls/${callId}`)
    );

    if (snapshot.exists()) {
      call = snapshot.val();
    }

    await saveMyHistory(
      callId,
      "ended",
      getCallDuration(),
      call
    );

  } catch (error) {
    console.error("END CALL ERROR:", error);
  }

  await cleanupCall(false);
}


// ============================================================
// HISTORY - GET REMOTE USER
// ============================================================

function getRemoteUserFromCall(call) {
  if (!call || !currentUser) {
    return null;
  }

  if (call.callerId === currentUser.uid) {
    return {
      uid: call.calleeId || "",
      name:
        call.calleeName ||
        call.calleeEmail ||
        "User",
      email: call.calleeEmail || ""
    };
  }

  if (call.calleeId === currentUser.uid) {
    return {
      uid: call.callerId || "",
      name:
        call.callerName ||
        call.callerEmail ||
        "User",
      email: call.callerEmail || ""
    };
  }

  return null;
}


// ============================================================
// SAVE CALL HISTORY
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
      getRemoteUserFromCall(call) ||
      currentRemoteUser ||
      {};

    const historyRef = ref(
      db,
      `callHistory/${currentUser.uid}/${callId}`
    );

    const historyData = {
      callId: callId,
      remoteUid: remote.uid || "",
      remoteName:
        remote.name ||
        remote.email ||
        "User",
      remoteEmail: remote.email || "",
      status: status || "ended",
      duration: Number(duration) || 0,
      timestamp: Date.now()
    };

    await set(
      historyRef,
      historyData
    );

    console.log(
      "CALL HISTORY SAVED:",
      historyData
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
    try {
      historyUnsubscribe();
    } catch (error) {
      console.warn(
        "History listener cleanup error:",
        error
      );
    }

    historyUnsubscribe = null;
  }

  if (!currentUser) {
    return;
  }

  const historyRef = ref(
    db,
    `callHistory/${currentUser.uid}`
  );

  console.log(
    "HISTORY LISTENER STARTED FOR:",
    currentUser.uid
  );

  historyUnsubscribe = onValue(
    historyRef,
    snapshot => {
      renderHistory(snapshot);
    },
    error => {
      console.error(
        "HISTORY LISTENER ERROR:",
        error
      );
    }
  );
}


// ============================================================
// RENDER HISTORY
// ============================================================

function renderHistory(snapshot) {
  // Your HTML uses callHistoryList
  const container =
    $("callHistoryList") ||
    $("historyList") ||
    $("callHistory") ||
    $("history");

  if (!container) {
    console.warn(
      "CALL HISTORY CONTAINER NOT FOUND."
    );
    return;
  }

  container.innerHTML = "";

  if (!snapshot.exists()) {
    container.innerHTML =
      "<p>No call history yet.</p>";

    return;
  }

  const history = snapshot.val();

  const entries = Object.entries(history)
    .map(([id, item]) => ({
      id,
      ...item
    }))
    .sort(
      (a, b) =>
        (b.timestamp || 0) -
        (a.timestamp || 0)
    );

  entries.forEach(item => {
    const name =
      item.remoteName ||
      item.remoteEmail ||
      "User";

    const email =
      item.remoteEmail || "";

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

    const dateElement =
      document.createElement("div");

    dateElement.className =
      "history-date";

    if (item.timestamp) {
      dateElement.textContent =
        new Date(
          item.timestamp
        ).toLocaleString();
    }

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

    if (item.timestamp) {
      info.appendChild(
        dateElement
      );
    }

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

function formatHistoryStatus(status) {
  switch (status) {
    case "rejected":
      return "❌ Rejected";

    case "cancelled":
      return "↩️ Cancelled";

    case "failed":
      return "⚠️ Failed";

    case "ended":
      return "📞 Completed";

    case "ringing":
      return "📞 Calling";

    default:
      return "📞 Call";
  }
}


// ============================================================
// FORMAT DURATION
// ============================================================

function formatDuration(seconds) {
  seconds = Number(seconds) || 0;

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
// RINGTONE
// ============================================================

function startRingtone() {
  stopRingtone();

  const ringtone =
    $("ringtone");

  if (ringtone) {
    try {
      ringtone.currentTime = 0;
      ringtone.loop = true;

      const playPromise =
        ringtone.play();

      if (
        playPromise &&
        typeof playPromise.catch === "function"
      ) {
        playPromise.catch(error => {
          console.warn(
            "RINGTONE PLAY BLOCKED:",
            error
          );
        });
      }

      return;

    } catch (error) {
      console.warn(
        "HTML RINGTONE ERROR:",
        error
      );
    }
  }

  // Fallback ringtone
  try {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    ringtoneContext =
      new AudioContext();

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
        ringtoneContext.currentTime + 0.03
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ringtoneContext.currentTime + 0.5
      );

      oscillator.connect(gain);

      gain.connect(
        ringtoneContext.destination
      );

      oscillator.start();

      oscillator.stop(
        ringtoneContext.currentTime + 0.5
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
  const ringtone =
    $("ringtone");

  if (ringtone) {
    try {
      ringtone.pause();
      ringtone.currentTime = 0;
    } catch (error) {
      console.warn(
        "RINGTONE STOP ERROR:",
        error
      );
    }
  }

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
        "RINGTONE CONTEXT ERROR:",
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

    usersUnsubscribe = null;
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

    incomingCallsUnsubscribe = null;
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
    remoteAudio.srcObject = null;
    remoteAudio.muted = false;
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
        .forEach(track => {
          try {
            track.stop();
          } catch (error) {
            // Ignore
          }
        });
    }

    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (error) {
        // Ignore
      }
    }
  }
);


// ============================================================
// NOTIFICATION SETUP BUTTON
// ============================================================

const notificationButton =
  document.createElement("button");

notificationButton.textContent =
  "🔔 Enable Call Notifications";

notificationButton.type =
  "button";

notificationButton.id =
  "enableNotificationsBtn";

notificationButton.style.display =
  "none";

notificationButton.addEventListener(
  "click",
  async () => {
    try {
      await requestNotificationPermission();

      if (
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        notificationButton.style.display =
          "none";

        showNotification(
          "Call notifications enabled."
        );
      }

    } catch (error) {
      console.error(
        "NOTIFICATION SETUP ERROR:",
        error
      );
    }
  }
);


// ============================================================
// ADD NOTIFICATION BUTTON
// ============================================================

function setupNotificationButton() {
  const main =
    $("mainSection");

  if (
    main &&
    !document.getElementById(
      "enableNotificationsBtn"
    )
  ) {
    main.prepend(
      notificationButton
    );
  }

  if (
    "Notification" in window &&
    Notification.permission !== "granted"
  ) {
    notificationButton.style.display =
      "block";
  } else {
    notificationButton.style.display =
      "none";
  }
}

if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    setupNotificationButton
  );
} else {
  setupNotificationButton();
}


// ============================================================
// STARTUP
// ============================================================

console.log(
  "✅ VOICE CHAT APP P2 LOADED"
);
