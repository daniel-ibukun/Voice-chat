// ============================================================
// VOICE CHAT APP
// Firebase + Authentication + Realtime Database + WebRTC
// Firebase SDK 12.0.0
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
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
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging.js";


// ============================================================
// FIREBASE CONFIG
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_EXISTING_API_KEY",
  authDomain: "voice-chat01-63e85.firebaseapp.com",
  databaseURL: "https://voice-chat01-63e85-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "voice-chat01-63e85",
  storageBucket: "voice-chat01-63e85.firebasestorage.app",
  messagingSenderId: "113293901393",
  appId: "1:113293901393:web:bfbca6f5da36368e274270"
};


// ============================================================
// FIREBASE INITIALIZATION
// ============================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getDatabase(app);

let messaging = null;

try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn("Firebase Messaging could not initialize:", error);
}


// ============================================================
// HELPER
// ============================================================

function $(id) {
  return document.getElementById(id);
}


// ============================================================
// GLOBAL VARIABLES
// ============================================================

let currentUser = null;

let currentCallId = null;
let currentCallRole = null;
let currentRemoteUser = null;

let pendingIncomingCall = null;

let peerConnection = null;
let localStream = null;

let pendingRemoteCandidates = [];
let remoteDescriptionSet = false;

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

let currentPresenceRef = null;


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
    },
    {
      urls: "stun:stun2.l.google.com:19302"
    }
  ]
};


// ============================================================
// AVATAR
// ============================================================

function makeAvatar(name) {
  const safeName =
    encodeURIComponent(
      String(name || "User").trim() || "User"
    );

  return `https://ui-avatars.com/api/?name=${safeName}&background=random&color=fff`;
}


// ============================================================
// NOTIFICATION MESSAGE
// ============================================================

let notificationTimeout = null;

function showNotification(message) {
  const element = $("notification");

  if (!element) {
    console.log("NOTIFICATION:", message);
    return;
  }

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(notificationTimeout);

  notificationTimeout = setTimeout(() => {
    element.style.display = "none";
  }, 4000);
}


// ============================================================
// AUTH - SHOW LOGIN
// ============================================================

$("showLoginBtn")?.addEventListener("click", () => {
  $("registerBox")?.classList.add("hidden");
  $("loginBox")?.classList.remove("hidden");

  if ($("registerMessage")) {
    $("registerMessage").textContent = "";
  }

  if ($("authMessage")) {
    $("authMessage").textContent = "";
  }
});


// ============================================================
// AUTH - SHOW REGISTER
// ============================================================

$("showRegisterBtn")?.addEventListener("click", () => {
  $("loginBox")?.classList.add("hidden");
  $("registerBox")?.classList.remove("hidden");

  if ($("authMessage")) {
    $("authMessage").textContent = "";
  }

  if ($("registerMessage")) {
    $("registerMessage").textContent = "";
  }
});


// ============================================================
// REGISTER
// ============================================================

$("registerForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const name = $("registerName")?.value.trim();
  const email = $("registerEmail")?.value.trim();
  const password = $("registerPassword")?.value;
  const confirmPassword = $("registerConfirmPassword")?.value;

  const message = $("registerMessage");
  const button = $("registerBtn");

  if (!name || !email || !password || !confirmPassword) {
    if (message) {
      message.textContent = "Please fill in every field.";
    }
    return;
  }

  if (password !== confirmPassword) {
    if (message) {
      message.textContent = "Passwords do not match.";
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
    if (button) {
      button.disabled = true;
      button.textContent = "Creating account...";
    }

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await updateProfile(credential.user, {
      displayName: name
    });

    await set(
      ref(db, `users/${credential.user.uid}`),
      {
        uid: credential.user.uid,
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

  } catch (error) {
    console.error("REGISTER ERROR:", error);

    if (message) {
      message.textContent =
        getFirebaseErrorMessage(error);
    }

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Create Account";
    }
  }
});


// ============================================================
// LOGIN
// ============================================================

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  const message = $("authMessage");
  const button = $("loginBtn");

  if (!email || !password) {
    if (message) {
      message.textContent =
        "Please enter your email and password.";
    }
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Logging in...";
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
    console.error("LOGIN ERROR:", error);

    if (message) {
      message.textContent =
        getFirebaseErrorMessage(error);
    }

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

    await cleanupCall(true);

    if (currentUser) {
      await update(
        ref(db, `users/${currentUser.uid}`),
        {
          online: false,
          lastSeen: Date.now()
        }
      );
    }

    stopAllListeners();

    await signOut(auth);

  } catch (error) {
    console.error("LOGOUT ERROR:", error);
  }

});


// ============================================================
// FIREBASE ERROR MESSAGES
// ============================================================

function getFirebaseErrorMessage(error) {

  const code = error?.code || "";

  switch (code) {

    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/invalid-email":
      return "Please enter a valid email.";

    case "auth/email-already-in-use":
      return "That email is already registered.";

    case "auth/weak-password":
      return "Password is too weak.";

    case "auth/user-not-found":
      return "User account not found.";

    case "auth/wrong-password":
      return "Incorrect password.";

    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";

    default:
      return error?.message || "Something went wrong.";
  }
}


// ============================================================
// AUTH STATE
// ============================================================

onAuthStateChanged(auth, async user => {

  console.log(
    "AUTH STATE:",
    user ? user.email : "SIGNED OUT"
  );

  if (user) {

    currentUser = user;

    $("authSection")?.classList.add("hidden");
    $("mainSection")?.classList.remove("hidden");

    await loadCurrentUser();

    startPresence();

    listenForUsers();

    listenForIncomingCalls();

    listenForHistory();

    setupNotificationButton();

    setupForegroundMessaging();

    console.log(
      "VOICE CHAT READY FOR:",
      currentUser.email
    );

  } else {

    currentUser = null;

    $("authSection")?.classList.remove("hidden");
    $("mainSection")?.classList.add("hidden");

    stopAllListeners();

  }

});


// ============================================================
// LOAD CURRENT USER
// ============================================================

async function loadCurrentUser() {

  if (!currentUser) return;

  try {

    const userRef =
      ref(db, `users/${currentUser.uid}`);

    const snapshot = await get(userRef);

    let name =
      currentUser.displayName ||
      currentUser.email ||
      "User";

    if (snapshot.exists()) {

      const data = snapshot.val();

      name =
        data.name ||
        currentUser.displayName ||
        currentUser.email ||
        "User";
    }

    if ($("welcomeText")) {
      $("welcomeText").textContent =
        `Welcome, ${name}!`;
    }

    if ($("myAvatar")) {
      $("myAvatar").src =
        makeAvatar(name);
    }

  } catch (error) {

    console.error(
      "LOAD CURRENT USER ERROR:",
      error
    );

  }
}


// ============================================================
// PRESENCE
// ============================================================

function startPresence() {

  if (!currentUser) return;

  currentPresenceRef =
    ref(db, `users/${currentUser.uid}`);

  update(currentPresenceRef, {
    online: true,
    lastSeen: Date.now()
  }).catch(error => {
    console.error("PRESENCE ERROR:", error);
  });

  onDisconnect(currentPresenceRef)
    .update({
      online: false,
      lastSeen: Date.now()
    })
    .catch(error => {
      console.error(
        "PRESENCE DISCONNECT ERROR:",
        error
      );
    });
}


// ============================================================
// USERS LIST
// ============================================================

function listenForUsers() {

  if (usersUnsubscribe) {
    usersUnsubscribe();
    usersUnsubscribe = null;
  }

  const usersRef = ref(db, "users");

  usersUnsubscribe = onValue(
    usersRef,

    snapshot => {

      renderUsers(snapshot);

    },

    error => {

      console.error(
        "USERS LIST ERROR:",
        error
      );

      const container = $("usersList");

      if (container) {
        container.innerHTML =
          "<p>Could not load users.</p>";
      }
    }
  );
}


// ============================================================
// RENDER USERS
// ============================================================

function renderUsers(snapshot) {

  const container = $("usersList");

  if (!container) {
    console.error(
      "usersList element was not found in index.html"
    );
    return;
  }

  container.innerHTML = "";

  if (!snapshot.exists()) {

    container.innerHTML =
      "<p>No other users have registered yet.</p>";

    return;
  }

  const users = snapshot.val();

  let count = 0;

  Object.entries(users).forEach(
    ([uid, user]) => {

      if (
        !user ||
        uid === currentUser?.uid
      ) {
        return;
      }

      count++;

      const item =
        document.createElement("div");

      item.className = "user-item";

      const info =
        document.createElement("div");

      info.className = "user-info";

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

      const text =
        document.createElement("div");

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

      text.appendChild(name);
      text.appendChild(email);

      info.appendChild(avatar);
      info.appendChild(text);

      const button =
        document.createElement("button");

      button.type = "button";

      button.className = "call-btn";

      button.textContent =
        "📞 Call";

      button.addEventListener(
        "click",
        () => {
          startCall({
            uid: uid,
            name:
              user.name ||
              user.email ||
              "User",
            email:
              user.email || ""
          });
        }
      );

      item.appendChild(info);
      item.appendChild(button);

      container.appendChild(item);
    }
  );

  if (count === 0) {

    container.innerHTML =
      "<p>No other users are available.</p>";
  }
}


// ============================================================
// START CALL
// ============================================================

async function startCall(remoteUser) {

  if (!currentUser) {
    showNotification("Please log in first.");
    return;
  }

  if (currentCallId) {
    showNotification(
      "You are already in a call."
    );
    return;
  }

  if (!remoteUser?.uid) {
    showNotification(
      "Could not find this user."
    );
    return;
  }

  if (remoteUser.uid === currentUser.uid) {
    showNotification(
      "You cannot call yourself."
    );
    return;
  }

  try {

    console.log(
      "STARTING CALL TO:",
      remoteUser
    );

    currentRemoteUser = remoteUser;

    currentCallRole = "caller";

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

    currentCallId = callRef.key;

    const callData = {

      callId: currentCallId,

      callerId: currentUser.uid,

      callerName:
        currentUser.displayName ||
        currentUser.email ||
        "User",

      callerEmail:
        currentUser.email || "",

      calleeId: remoteUser.uid,

      calleeName:
        remoteUser.name ||
        remoteUser.email ||
        "User",

      calleeEmail:
        remoteUser.email || "",

      type: "voice",

      status: "ringing",

      createdAt: Date.now()
    };

    await set(
      callRef,
      callData
    );

    listenForCallChanges(
      currentCallId,
      "caller"
    );

    listenForIceCandidates(
      currentCallId,
      "callee"
    );

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    await update(
      ref(db, `calls/${currentCallId}`),
      {
        offer: {
          type: offer.type,
          sdp: offer.sdp
        }
      }
    );

    showOutgoingCall(remoteUser);

    startRingtone();

    saveMyHistory(
      currentCallId,
      "ringing",
      0,
      callData
    );

    console.log(
      "CALL CREATED:",
      currentCallId
    );

  } catch (error) {

    console.error(
      "START CALL ERROR:",
      error
    );

    showNotification(
      "Could not start the call: " +
      error.message
    );

    if (currentCallId) {

      try {
        await update(
          ref(db, `calls/${currentCallId}`),
          {
            status: "failed",
            endedAt: Date.now()
          }
        );
      } catch (updateError) {
        console.error(
          "CALL FAILURE UPDATE ERROR:",
          updateError
        );
      }
    }

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

    if (
      !event.candidate ||
      !currentCallId ||
      !currentCallRole
    ) {
      return;
    }

    const side =
      currentCallRole === "caller"
        ? "caller"
        : "callee";

    const candidateRef =
      push(
        ref(
          db,
          `calls/${currentCallId}/candidates/${side}`
        )
      );

    set(
      candidateRef,
      event.candidate.toJSON()
    ).catch(error => {

      console.error(
        "ICE CANDIDATE ERROR:",
        error
      );

    });
  };


  pc.ontrack = event => {

    console.log(
      "REMOTE AUDIO TRACK RECEIVED"
    );

    const remoteAudio =
      $("remoteAudio");

    if (!remoteAudio) return;

    if (
      event.streams &&
      event.streams[0]
    ) {

      remoteAudio.srcObject =
        event.streams[0];

    } else {

      const stream =
        new MediaStream([
          event.track
        ]);

      remoteAudio.srcObject =
        stream;
    }

    remoteAudio.muted = false;

    remoteAudio.play()
      .catch(error => {

        console.warn(
          "REMOTE AUDIO PLAY BLOCKED:",
          error
        );

      });
  };


  pc.onconnectionstatechange = () => {

    console.log(
      "WEBRTC CONNECTION:",
      pc.connectionState
    );

    switch (pc.connectionState) {

      case "connected":

        stopRingtone();

        if (!callStartTime) {
          startCallTimer();
        }

        updateCallStatus(
          "Connected"
        );

        break;


      case "connecting":

        updateCallStatus(
          "Connecting..."
        );

        break;


      case "disconnected":

        updateCallStatus(
          "Connection interrupted..."
        );

        break;


      case "failed":

        updateCallStatus(
          "Connection failed"
        );

        showNotification(
          "The call connection failed."
        );

        setTimeout(() => {
          if (currentCallId) {
            endCall();
          }
        }, 1500);

        break;


      case "closed":

        break;
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
// LISTEN FOR CALL CHANGES
// ============================================================

function listenForCallChanges(
  callId,
  role
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
          "CALL UPDATE:",
          call
        );


        // --------------------------------------------
        // CALL ENDED
        // --------------------------------------------

        if (
          call.status === "ended" ||
          call.status === "rejected" ||
          call.status === "cancelled" ||
          call.status === "failed"
        ) {

          const status =
            call.status;

          if (
            currentCallId === callId
          ) {

            if (role === "caller") {

              await saveMyHistory(
                callId,
                status,
                getCallDuration(),
                call
              );

            }

            await cleanupCall(false);
          }

          return;
        }


        // --------------------------------------------
        // CALLEE ACCEPTED
        // --------------------------------------------

        if (
          role === "caller" &&
          call.status === "accepted"
        ) {

          stopRingtone();

          hideOutgoingCall();

          showActiveCall(
            currentRemoteUser
          );

          updateCallStatus(
            "Connecting..."
          );

          if (
            call.answer &&
            peerConnection &&
            !remoteDescriptionSet
          ) {

            try {

              await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                  call.answer
                )
              );

              remoteDescriptionSet = true;

              await flushPendingCandidates();

            } catch (error) {

              console.error(
                "SET ANSWER ERROR:",
                error
              );

            }
          }

          return;
        }


        // --------------------------------------------
        // CALLER RECEIVED ANSWER
        // --------------------------------------------

        if (
          role === "caller" &&
          call.answer &&
          peerConnection &&
          !remoteDescriptionSet
        ) {

          try {

            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(
                call.answer
              )
            );

            remoteDescriptionSet = true;

            stopRingtone();

            hideOutgoingCall();

            showActiveCall(
              currentRemoteUser
            );

            updateCallStatus(
              "Connecting..."
            );

            await flushPendingCandidates();

          } catch (error) {

            console.error(
              "ANSWER PROCESSING ERROR:",
              error
            );
          }
        }

      },
      error => {

        console.error(
          "CALL LISTENER ERROR:",
          error
        );
      }
    );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ============================================================
// LISTEN FOR INCOMING CALLS
// ============================================================

function listenForIncomingCalls() {

  if (incomingCallsUnsubscribe) {
    incomingCallsUnsubscribe();
    incomingCallsUnsubscribe = null;
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

        Object.entries(calls)
          .forEach(
            ([callId, call]) => {

              if (
                !call ||
                call.calleeId !==
                currentUser?.uid
              ) {
                return;
              }

              if (
                call.status !== "ringing"
              ) {
                return;
              }

              if (
                currentCallId ||
                pendingIncomingCall
              ) {
                return;
              }

              console.log(
                "INCOMING CALL:",
                call
              );

              pendingIncomingCall = {
                ...call,
                callId
              };

              currentCallId = callId;

              currentCallRole = "callee";

              currentRemoteUser = {
                uid: call.callerId,
                name:
                  call.callerName ||
                  call.callerEmail ||
                  "User",
                email:
                  call.callerEmail ||
                  ""
              };

              showIncomingCall(
                currentRemoteUser
              );

              startRingtone();

              listenForCallChanges(
                callId,
                "callee"
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
// ACCEPT CALL
// ============================================================

$("acceptCallBtn")?.addEventListener(
  "click",
  acceptIncomingCall
);


async function acceptIncomingCall() {

  if (
    !pendingIncomingCall ||
    !currentUser
  ) {
    return;
  }

  const call =
    pendingIncomingCall;

  try {

    stopRingtone();

    hideIncomingCall();

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

    remoteDescriptionSet = false;

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        call.offer
      )
    );

    remoteDescriptionSet = true;

    await flushPendingCandidates();

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );

    await update(
      ref(db, `calls/${call.callId}`),
      {
        status: "accepted",

        answer: {
          type: answer.type,
          sdp: answer.sdp
        },

        acceptedAt: Date.now()
      }
    );

    listenForIceCandidates(
      call.callId,
      "caller"
    );

    showActiveCall(
      currentRemoteUser
    );

    updateCallStatus(
      "Connecting..."
    );

    saveMyHistory(
      call.callId,
      "accepted",
      0,
      call
    );

    console.log(
      "CALL ACCEPTED:",
      call.callId
    );

  } catch (error) {

    console.error(
      "ACCEPT CALL ERROR:",
      error
    );

    showNotification(
      "Could not answer the call: " +
      error.message
    );

    if (call.callId) {

      try {

        await update(
          ref(
            db,
            `calls/${call.callId}`
          ),
          {
            status: "failed",
            endedAt: Date.now()
          }
        );

      } catch (updateError) {

        console.error(
          "FAILED CALL UPDATE:",
          updateError
        );
      }
    }

    await cleanupCall(false);
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

  const call =
    pendingIncomingCall;

  if (!call) {
    return;
  }

  stopRingtone();

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

    await saveMyHistory(
      call.callId,
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

    const snapshot =
      await get(
        ref(
          db,
          `calls/${callId}`
        )
      );

    if (snapshot.exists()) {

      const call =
        snapshot.val();

      await update(
        ref(
          db,
          `calls/${callId}`
        ),
        {
          status: "cancelled",
          endedAt: Date.now()
        }
      );

      await saveMyHistory(
        callId,
        "cancelled",
        0,
        call
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
// ICE CANDIDATES
// ============================================================

function listenForIceCandidates(
  callId,
  remoteSide
) {

  const candidatesRef =
    ref(
      db,
      `calls/${callId}/candidates/${remoteSide}`
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

        try {

          const iceCandidate =
            new RTCIceCandidate(
              candidate
            );

          if (
            peerConnection &&
            remoteDescriptionSet
          ) {

            await peerConnection.addIceCandidate(
              iceCandidate
            );

          } else {

            pendingRemoteCandidates.push(
              iceCandidate
            );
          }

        } catch (error) {

          console.error(
            "ADD ICE CANDIDATE ERROR:",
            error
          );
        }
      },
      error => {

        console.error(
          "ICE LISTENER ERROR:",
          error
        );
      }
    );

  callUnsubscribers.push(
    unsubscribe
  );
}


// ============================================================
// FLUSH ICE CANDIDATES
// ============================================================

async function flushPendingCandidates() {

  if (
    !peerConnection ||
    !remoteDescriptionSet
  ) {
    return;
  }

  const candidates =
    [...pendingRemoteCandidates];

  pendingRemoteCandidates = [];

  for (
    const candidate of candidates
  ) {

    try {

      await peerConnection.addIceCandidate(
        candidate
      );

    } catch (error) {

      console.error(
        "FLUSH ICE ERROR:",
        error
      );
    }
  }
}


// ============================================================
// OUTGOING CALL UI
// ============================================================

function showOutgoingCall(user) {

  $("outgoingCallOverlay")
    ?.classList.remove("hidden");

  if ($("outgoingCallerAvatar")) {

    $("outgoingCallerAvatar").src =
      makeAvatar(
        user?.name ||
        user?.email ||
        "User"
      );
  }

  if ($("outgoingCallerName")) {

    $("outgoingCallerName")
      .textContent =
      user?.name ||
      user?.email ||
      "User";
  }

  if ($("outgoingCallStatus")) {

    $("outgoingCallStatus")
      .textContent =
      "Calling...";
  }

  if ($("outgoingRinging")) {

    $("outgoingRinging")
      .textContent =
      "🔔 Ringing...";
  }
}


function hideOutgoingCall() {

  $("outgoingCallOverlay")
    ?.classList.add("hidden");
}


// ============================================================
// INCOMING CALL UI
// ============================================================

function showIncomingCall(user) {

  $("incomingCallOverlay")
    ?.classList.remove("hidden");

  if ($("incomingCallerAvatar")) {

    $("incomingCallerAvatar").src =
      makeAvatar(
        user?.name ||
        user?.email ||
        "User"
      );
  }

  if ($("incomingCallerName")) {

    $("incomingCallerName")
      .textContent =
      user?.name ||
      user?.email ||
      "User";
  }

  if ($("ringingIndicator")) {

    $("ringingIndicator")
      .textContent =
      "Someone is calling you...";
  }
}


function hideIncomingCall() {

  $("incomingCallOverlay")
    ?.classList.add("hidden");
}


// ============================================================
// ACTIVE CALL UI
// ============================================================

function showActiveCall(user) {

  $("callOverlay")
    ?.classList.remove("hidden");

  if ($("callAvatar")) {

    $("callAvatar").src =
      makeAvatar(
        user?.name ||
        user?.email ||
        "User"
      );
  }

  if ($("callName")) {

    $("callName")
      .textContent =
      user?.name ||
      user?.email ||
      "User";
  }

  if ($("callType")) {

    $("callType")
      .textContent =
      "Voice Call";
  }

  updateCallStatus(
    "Connecting..."
  );
}


function updateCallStatus(status) {

  if ($("callStatus")) {

    $("callStatus")
      .textContent =
      status;
  }
}


// ============================================================
// CALL TIMER
// ============================================================

function startCallTimer() {

  if (callStartTime) {
    return;
  }

  callStartTime =
    Date.now();

  updateCallTimer();

  callTimerInterval =
    setInterval(
      updateCallTimer,
      1000
    );
}


function updateCallTimer() {

  if (!$("callTimer")) {
    return;
  }

  $("callTimer")
    .textContent =
    formatDuration(
      getCallDuration()
    );
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

    isMuted =
      !isMuted;

    localStream
      .getAudioTracks()
      .forEach(track => {

        track.enabled =
          !isMuted;
      });

    if ($("muteBtn")) {

      $("muteBtn")
        .textContent =
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

    if ($("speakerBtn")) {

      $("speakerBtn")
        .textContent =
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

    await cleanupCall(false);

    return;
  }

  const callId =
    currentCallId;

  let call = null;

  try {

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
        status: "ended",
        endedAt: Date.now()
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

  await cleanupCall(false);
}


// ============================================================
// SAVE HISTORY
// ============================================================

function getRemoteUserFromCall(call) {

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
        call.calleeEmail || ""
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
        call.callerEmail || ""
    };
  }

  return null;
}


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

        remote.uid || "",

      remoteName:

        remote.name ||
        remote.email ||
        "User",

      remoteEmail:

        remote.email || "",

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

  if (historyUnsubscribe) {

    try {
      historyUnsubscribe();
    } catch (error) {
      console.warn(error);
    }

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

  console.log(
    "HISTORY LISTENER STARTED:",
    `callHistory/${currentUser.uid}`
  );

  historyUnsubscribe =
    onValue(

      historyRef,

      snapshot => {

        console.log(
          "HISTORY DATA RECEIVED:",
          snapshot.exists(),
          snapshot.val()
        );

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
          $("callHistoryList");

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

function renderHistory(snapshot) {

  const container =
    $("callHistoryList");

  if (!container) {

    console.error(
      "callHistoryList NOT FOUND"
    );

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
          (b.timestamp || 0) -
          (a.timestamp || 0)
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

    case "accepted":
      return "📞 Answered";

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

  seconds =
    Number(seconds) || 0;

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remaining =
    seconds % 60;

  return (
    String(minutes)
      .padStart(2, "0") +
    ":" +
    String(remaining)
      .padStart(2, "0")
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

      ringtone.currentTime =
        0;

      ringtone.loop =
        true;

      const promise =
        ringtone.play();

      if (
        promise &&
        typeof promise.catch ===
        "function"
      ) {

        promise.catch(error => {

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


  // Fallback generated tone

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

      ringtone.currentTime =
        0;

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


  callUnsubscribers
    .forEach(
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
        "PEER CLOSE ERROR:",
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

  remoteDescriptionSet =
    false;

  callStartTime =
    null;

  isMuted =
    false;

  isSpeakerOn =
    true;


  if ($("muteBtn")) {

    $("muteBtn")
      .textContent =
      "🎤 Mute";
  }

  if ($("speakerBtn")) {

    $("speakerBtn")
      .textContent =
      "🔊 Speaker";
  }


  hideAllCallOverlays();
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
      console.warn(error);
    }

    usersUnsubscribe = null;
  }


  if (incomingCallsUnsubscribe) {

    try {
      incomingCallsUnsubscribe();
    } catch (error) {
      console.warn(error);
    }

    incomingCallsUnsubscribe =
      null;
  }


  if (historyUnsubscribe) {

    try {
      historyUnsubscribe();
    } catch (error) {
      console.warn(error);
    }

    historyUnsubscribe =
      null;
  }


  callUnsubscribers
    .forEach(
      unsubscribe => {

        try {
          unsubscribe();
        } catch (error) {
          console.warn(error);
        }
      }
    );

  callUnsubscribers = [];
}


// ============================================================
// PAGE CLOSE
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
          } catch (error) {}
        });
    }

    if (peerConnection) {

      try {
        peerConnection.close();
      } catch (error) {}
    }
  }
);


// ============================================================
// NOTIFICATION SETUP
// ============================================================

let notificationButton = null;


function setupNotificationButton() {

  if (!notificationButton) {

    notificationButton =
      document.createElement(
        "button"
      );

    notificationButton.id =
      "enableNotificationsBtn";

    notificationButton.type =
      "button";

    notificationButton.textContent =
      "🔔 Enable Call Notifications";

    notificationButton.style.padding =
      "12px 16px";

    notificationButton.style.marginBottom =
      "15px";

    notificationButton.style.border =
      "none";

    notificationButton.style.borderRadius =
      "10px";

    notificationButton.style.background =
      "#2563eb";

    notificationButton.style.color =
      "white";

    notificationButton.style.fontWeight =
      "bold";


    notificationButton.addEventListener(
      "click",
      async () => {

        await requestNotificationPermission();

      }
    );
  }


  const main =
    $("mainSection");

  if (
    main &&
    !document.getElementById(
      "enableNotificationsBtn"
    )
  ) {

    main
      .querySelector(".main-content")
      ?.prepend(
        notificationButton
      );
  }


  if (
    "Notification" in window &&
    Notification.permission !==
    "granted"
  ) {

    notificationButton.style.display =
      "block";

  } else {

    notificationButton.style.display =
      "none";
  }
}


// ============================================================
// FCM / PUSH NOTIFICATIONS
// ============================================================

// Paste your existing VAPID public key here.
// Do NOT put a private VAPID key in this file.

const VAPID_PUBLIC_KEY =
  "YOUR_EXISTING_VAPID_PUBLIC_KEY";


async function requestNotificationPermission() {

  if (!("Notification" in window)) {

    showNotification(
      "This browser does not support notifications."
    );

    return;
  }


  if (!messaging) {

    showNotification(
      "Firebase Messaging is not available."
    );

    return;
  }


  try {

    const permission =
      await Notification.requestPermission();

    if (
      permission !== "granted"
    ) {

      showNotification(
        "Notification permission was not granted."
      );

      return;
    }


    const registration =
      await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
      );


    const token =
      await getToken(
        messaging,
        {
          vapidKey:
            VAPID_PUBLIC_KEY,

          serviceWorkerRegistration:
            registration
        }
      );


    if (!token) {

      showNotification(
        "Could not get notification token."
      );

      return;
    }


    console.log(
      "FCM TOKEN:",
      token
    );


    if (currentUser) {

      await set(
        ref(
          db,
          `users/${currentUser.uid}/fcmToken`
        ),
        token
      );

      await set(
        ref(
          db,
          `users/${currentUser.uid}/fcmTokenUpdatedAt`
        ),
        Date.now()
      );
    }


    if (notificationButton) {

      notificationButton.style.display =
        "none";
    }


    showNotification(
      "Call notifications enabled!"
    );

  } catch (error) {

    console.error(
      "NOTIFICATION PERMISSION ERROR:",
      error
    );

    showNotification(
      "Could not enable notifications."
    );
  }
}


// ============================================================
// FOREGROUND FCM
// ============================================================

let foregroundMessagingStarted =
  false;


function setupForegroundMessaging() {

  if (
    foregroundMessagingStarted ||
    !messaging
  ) {
    return;
  }

  foregroundMessagingStarted =
    true;


  onMessage(
    messaging,
    payload => {

      console.log(
        "FOREGROUND FCM MESSAGE:",
        payload
      );

      const notification =
        payload.notification ||
        {};

      showNotification(
        notification.title ||
        "Incoming call"
      );

      const data =
        payload.data ||
        {};

      if (
        data.type ===
        "incoming_call"
      ) {

        // The RTDB listener also handles
        // the actual incoming-call UI.
        console.log(
          "Incoming call notification received:",
          data
        );
      }
    }
  );
}


// ============================================================
// AUTO-REGISTER SERVICE WORKER
// ============================================================

if (
  "serviceWorker" in navigator
) {

  navigator.serviceWorker
    .register(
      "/firebase-messaging-sw.js"
    )
    .then(
      registration => {

        console.log(
          "Firebase messaging service worker registered:",
          registration.scope
        );

      }
    )
    .catch(error => {

      console.error(
        "SERVICE WORKER REGISTRATION ERROR:",
        error
      );
    });
}


// ============================================================
// STARTUP
// ============================================================

console.log(
  "===================================="
);

console.log(
  "✅ VOICE CHAT APP.JS LOADED"
);

console.log(
  "Firebase:", app.name
);

console.log(
  "===================================="
);
