// ============================================================
// VOICE CHAT APP - APP.JS
// ============================================================
// IMPORTANT:
// 1. Replace the Firebase configuration below.
// 2. Replace VAPID_KEY with your Firebase Web Push key.
// 3. This file expects Firebase v10+ modular SDK imports.
// ============================================================


// ============================================================
// FIREBASE IMPORTS
// ============================================================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  update,
  get,
  remove,
  push,
  onValue,
  onChildAdded,
  off
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

import {
  getMessaging,
  getToken,
  onMessage,
  isSupported
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging.js";


// ============================================================
// FIREBASE CONFIGURATION
// ============================================================
// FILL THESE IN WITH YOUR OWN FIREBASE VALUES.
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
// VAPID KEY
// ============================================================
// Firebase Console
// Project Settings
// Cloud Messaging
// Web Push certificates
// ============================================================

const VAPID_KEY = "BFhU6C-xoaa9VLZopXwHVADPWqSWxlKaYkCvvK3HaQ0RIImUVFKg5aYpIq2L5Odmd73Cf895Se1zdT9PPmQz-cE";
 


// ============================================================
// INITIALIZE FIREBASE
// ============================================================

const firebaseApp =
  initializeApp(firebaseConfig);

const auth =
  getAuth(firebaseApp);

const db =
  getDatabase(firebaseApp);


// ============================================================
// MESSAGING
// ============================================================

let messaging = null;

try {

  const supported =
    await isSupported();

  if (supported) {
    messaging =
      getMessaging(firebaseApp);
  }

} catch (error) {

  console.warn(
    "Firebase Messaging unavailable:",
    error
  );
}


// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser =
  null;

let currentRemoteUser =
  null;

let currentCallId =
  null;

let currentCallRole =
  null;

let pendingIncomingCall =
  null;

let localStream =
  null;

let peerConnection =
  null;

let callStartTime =
  null;

let callTimer =
  null;

let ringtoneTimer =
  null;

let ringtoneContext =
  null;

let isMuted =
  false;

let isSpeakerOn =
  true;

let historyUnsubscribe =
  null;

let usersUnsubscribe =
  null;

let incomingCallsUnsubscribe =
  null;

let callUnsubscribers =
  [];

let pendingRemoteCandidates =
  [];


// ============================================================
// WEBRTC CONFIGURATION
// ============================================================

const rtcConfiguration = {

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
// HELPER
// ============================================================

function $(id) {

  return document.getElementById(id);
}


// ============================================================
// NOTIFICATION
// ============================================================

async function requestNotificationPermission() {

  if (
    !("Notification" in window)
  ) {
    console.warn(
      "Notifications are not supported."
    );

    return false;
  }

  try {

    const permission =
      await Notification.requestPermission();

    return permission ===
      "granted";

  } catch (error) {

    console.error(
      "Notification permission error:",
      error
    );

    return false;
  }
}


// ============================================================
// SHOW NOTIFICATION
// ============================================================

function showNotification(
  title,
  options = {}
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
      options
    );

  } catch (error) {

    console.warn(
      "Notification error:",
      error
    );
  }
}


// ============================================================
// FORMAT DURATION
// ============================================================

function formatDuration(
  seconds
) {

  seconds =
    Math.max(
      0,
      Number(seconds) || 0
    );

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remaining =
    Math.floor(
      seconds % 60
    );

  return (
    String(minutes)
      .padStart(2, "0") +
    ":" +
    String(remaining)
      .padStart(2, "0")
  );
}


// ============================================================
// AVATAR
// ============================================================

function makeAvatar(name) {

  const text =
    String(name || "U")
      .trim()
      .charAt(0)
      .toUpperCase();

  return (
    "https://ui-avatars.com/api/" +
    "?name=" +
    encodeURIComponent(text) +
    "&background=random" +
    "&color=fff" +
    "&size=128"
  );
}


// ============================================================
// SAFE TEXT
// ============================================================

function safeText(value) {

  return String(
    value ?? ""
  ).trim();
}


// ============================================================
// AUTH UI
// ============================================================

function showLoggedInUI() {

  $("loginSection")
    ?.classList.add("hidden");

  $("signupSection")
    ?.classList.add("hidden");

  $("mainSection")
    ?.classList.remove("hidden");

  $("appSection")
    ?.classList.remove("hidden");

  $("logoutBtn")
    ?.classList.remove("hidden");
}


function showLoggedOutUI() {

  $("mainSection")
    ?.classList.add("hidden");

  $("appSection")
    ?.classList.add("hidden");

  $("logoutBtn")
    ?.classList.add("hidden");

  $("loginSection")
    ?.classList.remove("hidden");
}


// ============================================================
// UPDATE PROFILE UI
// ============================================================

function updateUserUI() {

  if (!currentUser) {
    return;
  }

  const name =
    currentUser.displayName ||
    currentUser.email ||
    "User";

  const email =
    currentUser.email ||
    "";

  [
    "currentUserName",
    "profileName",
    "userName"
  ].forEach(id => {

    const element =
      $(id);

    if (element) {
      element.textContent =
        name;
    }
  });


  [
    "currentUserEmail",
    "profileEmail",
    "userEmail"
  ].forEach(id => {

    const element =
      $(id);

    if (element) {
      element.textContent =
        email;
    }
  });


  [
    "currentUserAvatar",
    "profileAvatar",
    "userAvatar"
  ].forEach(id => {

    const element =
      $(id);

    if (
      element &&
      element.tagName ===
      "IMG"
    ) {

      element.src =
        makeAvatar(name);
    }
  });
}


// ============================================================
// REGISTER
// ============================================================

async function registerUser(
  email,
  password,
  name
) {

  try {

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    if (name) {

      await updateProfile(
        credential.user,
        {
          displayName:
            name
        }
      );
    }

    await set(
      ref(
        db,
        `users/${credential.user.uid}`
      ),
      {
        uid:
          credential.user.uid,

        name:
          name ||
          email,

        email:
          email,

        online:
          true,

        lastSeen:
          Date.now()
      }
    );

    return credential.user;

  } catch (error) {

    console.error(
      "REGISTER ERROR:",
      error
    );

    alert(
      error.message
    );

    return null;
  }
}


// ============================================================
// LOGIN
// ============================================================

async function loginUser(
  email,
  password
) {

  try {

    const credential =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    return credential.user;

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    alert(
      error.message
    );

    return null;
  }
}


// ============================================================
// LOGOUT
// ============================================================

async function logoutUser() {

  try {

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

  } catch (error) {

    console.warn(
      "Could not update offline status:",
      error
    );
  }

  await cleanupCall(
    false
  );

  try {

    await signOut(
      auth
    );

  } catch (error) {

    console.error(
      "LOGOUT ERROR:",
      error
    );
  }
}


// ============================================================
// LOGIN BUTTON
// ============================================================

$("loginBtn")?.addEventListener(
  "click",
  async () => {

    const email =
      safeText(
        $("loginEmail")?.value
      );

    const password =
      $("loginPassword")?.value ||
      "";

    if (
      !email ||
      !password
    ) {

      alert(
        "Please enter your email and password."
      );

      return;
    }

    await loginUser(
      email,
      password
    );
  }
);


// ============================================================
// SIGNUP BUTTON
// ============================================================

$("signupBtn")?.addEventListener(
  "click",
  async () => {

    const name =
      safeText(
        $("signupName")?.value
      );

    const email =
      safeText(
        $("signupEmail")?.value
      );

    const password =
      $("signupPassword")?.value ||
      "";

    if (
      !email ||
      !password
    ) {

      alert(
        "Please enter your email and password."
      );

      return;
    }

    await registerUser(
      email,
      password,
      name
    );
  }
);


// ============================================================
// LOGOUT BUTTON
// ============================================================

$("logoutBtn")?.addEventListener(
  "click",
  logoutUser
);


// ============================================================
// USERS
// ============================================================

function listenForUsers() {

  if (
    usersUnsubscribe
  ) {

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
          snapshot
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
// RENDER USERS
// ============================================================

function renderUsers(
  snapshot
) {

  const container =
    $("usersList") ||
    $("userList") ||
    $("users");

  if (!container) {
    return;
  }

  container.innerHTML =
    "";

  if (
    !snapshot.exists()
  ) {

    container.innerHTML =
      "<p>No other users yet.</p>";

    return;
  }

  const users =
    snapshot.val();

  Object.entries(users)
    .forEach(
      ([uid, user]) => {

        if (
          uid ===
          currentUser?.uid
        ) {
          return;
        }

        const element =
          document.createElement(
            "div"
          );

        element.className =
          "user-item";


        const avatar =
          document.createElement(
            "img"
          );

        avatar.src =
          makeAvatar(
            user.name ||
            user.email
          );

        avatar.alt =
          user.name ||
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


        const status =
          document.createElement(
            "div"
          );

        status.className =
          "user-status";

        status.textContent =
          user.online
            ? "🟢 Online"
            : "⚫ Offline";


        const callButton =
          document.createElement(
            "button"
          );

        callButton.type =
          "button";

        callButton.textContent =
          "📞 Call";

        callButton.disabled =
          !user.online;


        callButton.addEventListener(
          "click",
          () => {

            startOutgoingCall(
              {
                uid:
                  uid,

                name:
                  user.name ||
                  user.email ||
                  "User",

                email:
                  user.email ||
                  ""
              }
            );
          }
        );


        info.appendChild(
          name
        );

        info.appendChild(
          status
        );

        element.appendChild(
          avatar
        );

        element.appendChild(
          info
        );

        element.appendChild(
          callButton
        );

        container.appendChild(
          element
        );
      }
    );
}


// ============================================================
// PEER CONNECTION
// ============================================================

function createPeerConnection(
  callId,
  role
) {

  if (peerConnection) {

    try {
      peerConnection.close();
    } catch (_) {}

  }

  peerConnection =
    new RTCPeerConnection(
      rtcConfiguration
    );


  peerConnection.onicecandidate =
    async event => {

      if (
        !event.candidate
      ) {
        return;
      }

      try {

        const candidateRef =
          push(
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

      } else {

        const stream =
          new MediaStream();

        stream.addTrack(
          event.track
        );

        remoteAudio.srcObject =
          stream;
      }

      remoteAudio.muted =
        !isSpeakerOn;

      remoteAudio.play()
        .catch(() => {});
    };


  peerConnection.onconnectionstatechange =
    () => {

      const state =
        peerConnection?.connectionState;

      console.log(
        "WebRTC connection:",
        state
      );

      if (
        state ===
          "connected"
      ) {

        startCallTimer();

        updateCallStatus(
          callId,
          "connected"
        );
      }

      if (
        state ===
          "failed"
      ) {

        updateCallStatus(
          callId,
          "failed"
        );
      }

      if (
        state ===
          "disconnected"
      ) {

        console.warn(
          "Peer disconnected."
        );
      }
    };


  return peerConnection;
}


// ============================================================
// GET MICROPHONE
// ============================================================

async function getLocalStream() {

  if (localStream) {
    return localStream;
  }

  try {

    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: false
        });

    return localStream;

  } catch (error) {

    console.error(
      "MICROPHONE ERROR:",
      error
    );

    alert(
      "Microphone access is required to make voice calls."
    );

    return null;
  }
}


// ============================================================
// OUTGOING CALL
// ============================================================

async function startOutgoingCall(
  remoteUser
) {

  if (!currentUser) {

    alert(
      "Please log in first."
    );

    return;
  }

  if (currentCallId) {

    alert(
      "You are already in a call."
    );

    return;
  }

  if (!remoteUser?.uid) {
    return;
  }


  currentRemoteUser =
    remoteUser;

  currentCallRole =
    "caller";


  const callRef =
    push(
      ref(db, "calls")
    );

  const callId =
    callRef.key;

  currentCallId =
    callId;


  const callData = {

    callId:

      callId,

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
      remoteUser.uid,

    calleeName:
      remoteUser.name ||
      remoteUser.email ||
      "User",

    calleeEmail:
      remoteUser.email ||
      "",

    status:
      "ringing",

    type:
      "voice",

    createdAt:
      Date.now(),

    endedAt:
      null
  };


  try {

    await set(
      callRef,
      callData
    );


    await getLocalStream();

    if (!localStream) {

      await remove(
        callRef
      );

      await cleanupCall(
        false
      );

      return;
    }


    createPeerConnection(
      callId,
      "caller"
    );


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


    const offer =
      await peerConnection
        .createOffer();

    await peerConnection
      .setLocalDescription(
        offer
      );


    await update(
      ref(
        db,
        `calls/${callId}`
      ),
      {
        offer:
          {
            type:
              offer.type,

            sdp:
              offer.sdp
          }
      }
    );


    showOutgoingCall(
      remoteUser
    );

    listenToCall(
      callId,
      "caller"
    );

    listenForCalleeCandidates(
      callId
    );

    startCallTimer();

  } catch (error) {

    console.error(
      "OUTGOING CALL ERROR:",
      error
    );

    await cleanupCall(
      false
    );

    alert(
      "Could not start the call."
    );
  }
}


// ============================================================
// LISTEN TO CALL
// ============================================================

function listenToCall(
  callId,
  role
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

        if (
          !snapshot.exists()
        ) {
          return;
        }

        const call =
          snapshot.val();


        if (
          role === "caller" &&
          call.answer &&
          peerConnection
        ) {

          try {

            if (
              !peerConnection
                .currentRemoteDescription
            ) {

              await peerConnection
                .setRemoteDescription(
                  new RTCSessionDescription(
                    call.answer
                  )
                );

              await addPendingCandidates();
            }

          } catch (error) {

            console.error(
              "SET ANSWER ERROR:",
              error
            );
          }
        }


        if (
          call.status ===
          "rejected"
        ) {

          await saveMyHistory(
            callId,
            "rejected",
            0,
            call
          );

          alert(
            "The call was rejected."
          );

          await cleanupCall(
            false
          );
        }


        if (
          call.status ===
          "cancelled"
        ) {

          await saveMyHistory(
            callId,
            "cancelled",
            0,
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

          if (
            currentCallId ===
            callId
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
        }
      }
    );


  callUnsubscribers.push(
    unsubscribe
  );
}


// ============================================================
// INCOMING CALL LISTENER
// ============================================================

function listenForIncomingCalls() {

  if (
    incomingCallsUnsubscribe
  ) {

    incomingCallsUnsubscribe();

    incomingCallsUnsubscribe =
      null;
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

        if (
          !snapshot.exists()
        ) {
          return;
        }

        const calls =
          snapshot.val();


        Object.entries(calls)
          .forEach(
            ([callId, call]) => {

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

              handleIncomingCall(
                callId,
                call
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
// HANDLE INCOMING CALL
// ============================================================

function handleIncomingCall(
  callId,
  call
) {

  if (
    pendingIncomingCall
  ) {
    return;
  }

  pendingIncomingCall = {

    callId:
      callId,

    ...call
  };


  startRingtone();

  showIncomingCall(
    call
  );


  showNotification(
    "Incoming call",
    {
      body:
        `${
          call.callerName ||
          call.callerEmail ||
          "Someone"
        } is calling you.`
    }
  );
}


// ============================================================
// ACCEPT CALL
// ============================================================

$("acceptCallBtn")?.addEventListener(
  "click",
  acceptIncomingCall
);


async function acceptIncomingCall() {

  const incoming =
    pendingIncomingCall;

  if (!incoming) {
    return;
  }


  stopRingtone();


  currentCallId =
    incoming.callId;

  currentCallRole =
    "callee";


  currentRemoteUser = {

    uid:
      incoming.callerId,

    name:
      incoming.callerName ||
      incoming.callerEmail ||
      "User",

    email:
      incoming.callerEmail ||
      ""
  };


  try {

    await getLocalStream();

    if (!localStream) {

      await rejectIncomingCall();

      return;
    }


    createPeerConnection(
      currentCallId,
      "callee"
    );


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


    await peerConnection
      .setRemoteDescription(
        new RTCSessionDescription(
          incoming.offer
        )
      );


    await addPendingCandidates();


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
        `calls/${currentCallId}`
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


    showActiveCall(
      currentRemoteUser
    );

    listenToCall(
      currentCallId,
      "callee"
    );

    listenForCallerCandidates(
      currentCallId
    );

    pendingIncomingCall =
      null;

    startCallTimer();

  } catch (error) {

    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    await rejectIncomingCall();
  }
}


// ============================================================
// REJECT CALL
// ============================================================

$("rejectCallBtn")?.addEventListener(
  "click",
  rejectIncomingCall
);


async function rejectIncomingCall() {

  const incoming =
    pendingIncomingCall;

  if (!incoming) {
    return;
  }


  stopRingtone();


  try {

    await update(
      ref(
        db,
        `calls/${incoming.callId}`
      ),
      {
        status:
          "rejected",

        endedAt:
          Date.now()
      }
    );


    await saveMyHistory(
      incoming.callId,
      "rejected",
      0,
      incoming
    );

  } catch (error) {

    console.error(
      "REJECT CALL ERROR:",
      error
    );
  }


  pendingIncomingCall =
    null;

  hideAllCallOverlays();
}


// ============================================================
// CANCEL OUTGOING CALL
// ============================================================

$("cancelCallBtn")?.addEventListener(
  "click",
  async () => {

    if (
      !currentCallId
    ) {
      return;
    }

    try {

      await update(
        ref(
          db,
          `calls/${currentCallId}`
        ),
        {
          status:
            "cancelled",

          endedAt:
            Date.now()
        }
      );

    } catch (error) {

      console.error(
        "CANCEL CALL ERROR:",
        error
      );
    }

    await cleanupCall(
      false
    );
  }
);


// ============================================================
// ADD PENDING ICE CANDIDATES
// ============================================================

async function addPendingCandidates() {

  if (
    !peerConnection
  ) {
    return;
  }

  const candidates =
    pendingRemoteCandidates;

  pendingRemoteCandidates =
    [];

  for (
    const candidate
    of candidates
  ) {

    try {

      await peerConnection
        .addIceCandidate(
          new RTCIceCandidate(
            candidate
          )
        );

    } catch (error) {

      console.warn(
        "PENDING ICE ERROR:",
        error
      );
    }
  }
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


        if (
          peerConnection &&
          peerConnection.remoteDescription
        ) {

          try {

            await peerConnection
              .addIceCandidate(
                new RTCIceCandidate(
                  candidate
                )
              );

          } catch (error) {

            console.warn(
              "CALLER ICE ERROR:",
              error
            );
          }

        } else {

          pendingRemoteCandidates
            .push(candidate);
        }
      }
    );


  callUnsubscribers.push(
    () => {

      off(
        candidatesRef,
        "child_added",
        unsubscribe
      );

    }
  );
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


        if (
          peerConnection &&
          peerConnection.remoteDescription
        ) {

          try {

            await peerConnection
              .addIceCandidate(
                new RTCIceCandidate(
                  candidate
                )
              );

          } catch (error) {

            console.warn(
              "CALLEE ICE ERROR:",
              error
            );
          }

        } else {

          pendingRemoteCandidates
            .push(candidate);
        }
      }
    );


  callUnsubscribers.push(
    () => {

      off(
        candidatesRef,
        "child_added",
        unsubscribe
      );

    }
  );
}


// ============================================================
// UPDATE CALL STATUS
// ============================================================

async function updateCallStatus(
  callId,
  status
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
          status
      }
    );

  } catch (error) {

    console.warn(
      "CALL STATUS ERROR:",
      error
    );
  }
}


// ============================================================
// CALL TIMER
// ============================================================

function startCallTimer() {

  if (
    !callStartTime
  ) {

    callStartTime =
      Date.now();
  }


  stopCallTimer();


  callTimer =
    setInterval(
      () => {

        const duration =
          getCallDuration();

        const formatted =
          formatDuration(
            duration
          );


        [
          "callTimer",
          "callDuration",
          "activeCallTimer"
        ].forEach(id => {

          const element =
            $(id);

          if (element) {

            element.textContent =
              formatted;
          }
        });

      },
      1000
    );
}


function stopCallTimer() {

  if (callTimer) {

    clearInterval(
      callTimer
    );

    callTimer =
      null;
  }
}


function getCallDuration() {

  if (
    !callStartTime
  ) {
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


    if (
      isSpeakerOn
    ) {

      audio.play()
        .catch(() => {});
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

  const callId =
    currentCallId;


  if (!callId) {

    await cleanupCall(
      false
    );

    return;
  }


  let call =
    null;


  try {

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
// HISTORY - REMOTE USER
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
        call.calleeId ||
        "",

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

  if (
    !currentUser ||
    !callId
  ) {
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
        remote.uid ||
        "",

      remoteName:
        remote.name ||
        remote.email ||
        "User",

      remoteEmail:
        remote.email ||
        "",

      status:
        status ||
        "ended",

      duration:
        Number(duration) ||
        0,

      timestamp:
        Date.now()
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

  if (
    historyUnsubscribe
  ) {

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
          snapshot
        );
      },
      error => {

        console.error(
          "HISTORY LISTENER ERROR:",
          error
        );

        const container =
          $("historyList") ||
          $("callHistory") ||
          $("history");

        if (container) {

          container.innerHTML =
            `<p>Unable to load call history.</p>`;
        }
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
    return;
  }


  container.innerHTML =
    "";


  if (
    !snapshot.exists()
  ) {

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

          ...(item || {})
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
          item.duration
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

  switch (
    status
  ) {

    case "rejected":
      return "❌ Rejected";

    case "cancelled":
      return "↩️ Cancelled";

    case "failed":
      return "⚠️ Failed";

    case "connected":
      return "📞 Completed";

    case "ended":
      return "📞 Completed";

    default:
      return "📞 Call";
  }
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

  if (
    ringtoneTimer
  ) {

    clearInterval(
      ringtoneTimer
    );

    ringtoneTimer =
      null;
  }


  if (
    ringtoneContext
  ) {

    try {

      ringtoneContext.close();

    } catch (_) {}

    ringtoneContext =
      null;
  }
}


// ============================================================
// SHOW INCOMING CALL
// ============================================================

function showIncomingCall(
  call
) {

  hideElement(
    "outgoingCallOverlay"
  );

  hideElement(
    "callOverlay"
  );


  const overlay =
    $("incomingCallOverlay");

  if (!overlay) {
    return;
  }


  const name =
    call.callerName ||
    call.callerEmail ||
    "Incoming call";


  [
    "incomingCallerName",
    "incomingCallName"
  ].forEach(id => {

    const element =
      $(id);

    if (element) {
      element.textContent =
        name;
    }
  });


  [
    "incomingCallerAvatar",
    "incomingCallAvatar"
  ].forEach(id => {

    const element =
      $(id);

    if (
      element &&
      element.tagName ===
      "IMG"
    ) {

      element.src =
        makeAvatar(name);
    }
  });


  overlay.classList.remove(
    "hidden"
  );
}


// ============================================================
// SHOW OUTGOING CALL
// ============================================================

function showOutgoingCall(
  user
) {

  hideElement(
    "incomingCallOverlay"
  );

  hideElement(
    "callOverlay"
  );


  const overlay =
    $("outgoingCallOverlay");

  if (!overlay) {
    return;
  }


  const name =
    user.name ||
    user.email ||
    "Calling...";


  [
    "outgoingCallerName",
    "outgoingCallName",
    "outgoingName"
  ].forEach(id => {

    const element =
      $(id);

    if (element) {

      element.textContent =
        name;
    }
  });


  overlay.classList.remove(
    "hidden"
  );
}


// ============================================================
// SHOW ACTIVE CALL
// ============================================================

function showActiveCall(
  user
) {

  hideElement(
    "incomingCallOverlay"
  );

  hideElement(
    "outgoingCallOverlay"
  );


  const overlay =
    $("callOverlay");

  if (!overlay) {
    return;
  }


  const name =
    user.name ||
    user.email ||
    "User";


  [
    "activeCallName",
    "callUserName",
    "remoteUserName"
  ].forEach(id => {

    const element =
      $(id);

    if (element) {

      element.textContent =
        name;
    }
  });


  [
    "activeCallAvatar",
    "callUserAvatar",
    "remoteUserAvatar"
  ].forEach(id => {

    const element =
      $(id);

    if (
      element &&
      element.tagName ===
      "IMG"
    ) {

      element.src =
        makeAvatar(name);
    }
  });


  overlay.classList.remove(
    "hidden"
  );
}


// ============================================================
// HIDE ELEMENT
// ============================================================

function hideElement(
  id
) {

  $(id)
    ?.classList
    .add("hidden");
}


// ============================================================
// HIDE ALL CALL OVERLAYS
// ============================================================

function hideAllCallOverlays() {

  hideElement(
    "incomingCallOverlay"
  );

  hideElement(
    "outgoingCallOverlay"
  );

  hideElement(
    "callOverlay"
  );
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

      console.warn(
        "DATABASE CLEANUP ERROR:",
        error
      );
    }
  }


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


  if (
    localStream
  ) {

    localStream
      .getTracks()
      .forEach(
        track => {

          try {
            track.stop();
          } catch (_) {}

        }
      );

    localStream =
      null;
  }


  if (
    peerConnection
  ) {

    try {

      peerConnection.close();

    } catch (_) {}

    peerConnection =
      null;
  }


  const remoteAudio =
    $("remoteAudio");


  if (remoteAudio) {

    remoteAudio.pause?.();

    remoteAudio.srcObject =
      null;

    remoteAudio.muted =
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
// FIREBASE MESSAGING SETUP
// ============================================================

async function setupMessaging() {

  if (!messaging) {
    return;
  }


  try {

    if (
      !VAPID_KEY ||
      VAPID_KEY ===
      "YOUR_VAPID_KEY"
    ) {

      console.warn(
        "VAPID key has not been configured."
      );

      return;
    }


    const registration =
      await navigator
        .serviceWorker
        .register(
          "/firebase-messaging-sw.js"
        );


    const token =
      await getToken(
        messaging,
        {
          vapidKey:
            VAPID_KEY,

          serviceWorkerRegistration:
            registration
        }
      );


    if (
      token &&
      currentUser
    ) {

      await set(
        ref(
          db,
          `fcmTokens/${currentUser.uid}/${btoa(token).replace(/[.#$[\]/]/g, "_")}`
        ),
        {
          token:
            token,

          createdAt:
            Date.now()
        }
      );

      console.log(
        "FCM TOKEN READY"
      );
    }


    onMessage(
      messaging,
      payload => {

        console.log(
          "FOREGROUND MESSAGE:",
          payload
        );


        const title =
          payload.notification?.title ||
          payload.data?.title ||
          "Incoming call";


        const body =
          payload.notification?.body ||
          payload.data?.body ||
          "You have a new notification.";


        showNotification(
          title,
          {
            body:
              body
          }
        );
      }
    );

  } catch (error) {

    console.warn(
      "MESSAGING SETUP ERROR:",
      error
    );
  }
}


// ============================================================
// ONLINE STATUS
// ============================================================

async function setOnlineStatus(
  online
) {

  if (!currentUser) {
    return;
  }


  try {

    await update(
      ref(
        db,
        `users/${currentUser.uid}`
      ),
      {

        online:
          online,

        lastSeen:
          Date.now()
      }
    );

  } catch (error) {

    console.warn(
      "ONLINE STATUS ERROR:",
      error
    );
  }
}


// ============================================================
// BEFORE UNLOAD
// ============================================================

window.addEventListener(
  "beforeunload",
  () => {

    stopRingtone();

    stopCallTimer();


    if (
      localStream
    ) {

      localStream
        .getTracks()
        .forEach(
          track => {

            try {
              track.stop();
            } catch (_) {}

          }
        );
    }


    if (
      peerConnection
    ) {

      try {

        peerConnection.close();

      } catch (_) {}
    }


    if (
      currentUser
    ) {

      // This is intentionally fire-and-forget.
      update(
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
      )
      .catch(() => {});
    }
  }
);


// ============================================================
// ENABLE NOTIFICATIONS BUTTON
// ============================================================

function createNotificationButton() {

  if (
    $("enableNotificationsBtn")
  ) {
    return;
  }


  const main =
    $("mainSection") ||
    $("appSection") ||
    document.body;


  const button =
    document.createElement(
      "button"
    );


  button.id =
    "enableNotificationsBtn";

  button.type =
    "button";

  button.textContent =
    "🔔 Enable Call Notifications";


  button.addEventListener(
    "click",
    async () => {

      const granted =
        await requestNotificationPermission();


      if (granted) {

        button.remove();

        await setupMessaging();

        showNotification(
          "Notifications enabled",
          {
            body:
              "You can now receive call notifications."
          }
        );
      }
    }
  );


  main.prepend(
    button
  );
}


// ============================================================
// AUTH STATE
// ============================================================

onAuthStateChanged(
  auth,
  async user => {

    currentUser =
      user;


    if (!user) {

      showLoggedOutUI();

      stopAllListeners();

      await cleanupCall(
        false
      );

      return;
    }


    showLoggedInUI();

    updateUserUI();


    try {

      await set(
        ref(
          db,
          `users/${user.uid}`
        ),
        {

          uid:
            user.uid,

          name:
            user.displayName ||
            user.email ||
            "User",

          email:
            user.email ||
            "",

          online:
            true,

          lastSeen:
            Date.now()
        }
      );

    } catch (error) {

      console.error(
        "USER PROFILE ERROR:",
        error
      );
    }


    listenForUsers();

    listenForIncomingCalls();

    listenForHistory();


    if (
      "Notification" in window &&
      Notification.permission !==
      "granted"
    ) {

      createNotificationButton();

    } else {

      await setupMessaging();
    }
  }
);


// ============================================================
// STOP ALL LISTENERS
// ============================================================

function stopAllListeners() {

  if (
    usersUnsubscribe
  ) {

    try {
      usersUnsubscribe();
    } catch (_) {}

    usersUnsubscribe =
      null;
  }


  if (
    incomingCallsUnsubscribe
  ) {

    try {
      incomingCallsUnsubscribe();
    } catch (_) {}

    incomingCallsUnsubscribe =
      null;
  }


  if (
    historyUnsubscribe
  ) {

    try {
      historyUnsubscribe();
    } catch (_) {}

    historyUnsubscribe =
      null;
  }


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
}


// ============================================================
// STARTUP
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    console.log(
      "✅ VOICE CHAT APP LOADED"
    );


    // Make sure overlays start hidden.

    hideAllCallOverlays();


    // Ask for notification permission
    // only after a real user interaction.

    if (
      "Notification" in window &&
      Notification.permission ===
      "default"
    ) {

      // Button is created after login.
    }
  }
);
