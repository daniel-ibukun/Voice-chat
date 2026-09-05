// ============================================================
// VOICE CHAT APP
// Firebase Authentication + Realtime Database + WebRTC
// Voice Calls + Call History + Notifications
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
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
// WEBRTC
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
// GLOBAL STATE
// ============================================================

let currentUser = null;
let currentProfile = null;

let usersListener = null;
let incomingCallsListener = null;
let callHistoryListener = null;
let currentCallListener = null;

let callerCandidatesListener = null;
let calleeCandidatesListener = null;

let currentCallId = null;
let currentCall = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let incomingCall = null;

let callStartedAt = null;
let callTimerInterval = null;
let callTimeout = null;

let isMuted = false;
let isSpeakerOn = true;
let isCleaningUp = false;

const processedIncomingCalls = new Set();
const addedCandidateKeys = new Set();


// ============================================================
// DOM ELEMENTS
// ============================================================

const authSection = document.getElementById("authSection");
const mainSection = document.getElementById("mainSection");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

const registerName = document.getElementById("registerName");
const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");
const registerConfirmPassword =
    document.getElementById("registerConfirmPassword");

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

const showRegisterBtn =
    document.getElementById("showRegisterBtn");

const showLoginBtn =
    document.getElementById("showLoginBtn");

const authMessage =
    document.getElementById("authMessage");

const usersList =
    document.getElementById("usersList");

const welcomeText =
    document.getElementById("welcomeText");

const myAvatar =
    document.getElementById("myAvatar");


// ============================================================
// INCOMING CALL ELEMENTS
// ============================================================

const incomingCallOverlay =
    document.getElementById("incomingCallOverlay");

const incomingCallerAvatar =
    document.getElementById("incomingCallerAvatar");

const incomingCallerName =
    document.getElementById("incomingCallerName");

const incomingCallerEmail =
    document.getElementById("incomingCallerEmail");

const ringingIndicator =
    document.getElementById("ringingIndicator");

const rejectCallBtn =
    document.getElementById("rejectCallBtn");

const acceptCallBtn =
    document.getElementById("acceptCallBtn");


// ============================================================
// ACTIVE CALL ELEMENTS
// ============================================================

const callOverlay =
    document.getElementById("callOverlay");

const callAvatar =
    document.getElementById("callAvatar");

const callType =
    document.getElementById("callType");

const callName =
    document.getElementById("callName");

const callStatus =
    document.getElementById("callStatus");

const callTimer =
    document.getElementById("callTimer");

const muteBtn =
    document.getElementById("muteBtn");

const speakerBtn =
    document.getElementById("speakerBtn");

const endCallBtn =
    document.getElementById("endCallBtn");


// ============================================================
// OUTGOING CALL ELEMENTS
// ============================================================

const outgoingCallOverlay =
    document.getElementById("outgoingCallOverlay");

const outgoingCallerAvatar =
    document.getElementById("outgoingCallerAvatar");

const outgoingCallerName =
    document.getElementById("outgoingCallerName");

const outgoingCallStatus =
    document.getElementById("outgoingCallStatus");

const outgoingRinging =
    document.getElementById("outgoingRinging");

const cancelCallBtn =
    document.getElementById("cancelCallBtn");


// ============================================================
// AUDIO
// ============================================================

const remoteAudio =
    document.getElementById("remoteAudio");

const ringtone =
    document.getElementById("ringtone");


// ============================================================
// NOTIFICATION
// ============================================================

const notification =
    document.getElementById("notification");


// ============================================================
// CALL HISTORY
// ============================================================

const callHistory =
    document.getElementById("callHistory");


// ============================================================
// HELPERS
// ============================================================

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function avatarLetter(name) {
    if (!name) return "?";

    return String(name)
        .trim()
        .charAt(0)
        .toUpperCase();
}


function formatTime(seconds) {
    seconds = Number(seconds) || 0;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(remainingSeconds).padStart(2, "0")
    );
}


function showMessage(message, type = "info") {
    if (!authMessage) return;

    authMessage.textContent = message;
    authMessage.dataset.type = type;
}


function showNotification(message) {
    if (!notification) {
        console.log(message);
        return;
    }

    notification.textContent = message;
    notification.classList.remove("hidden");

    clearTimeout(showNotification.timeout);

    showNotification.timeout = setTimeout(() => {
        notification.classList.add("hidden");
    }, 4000);
}


function showScreen(screen) {
    if (screen === "main") {
        authSection?.classList.add("hidden");
        mainSection?.classList.remove("hidden");
    } else {
        mainSection?.classList.add("hidden");
        authSection?.classList.remove("hidden");
    }
}


// ============================================================
// LOGIN / REGISTER SWITCH
// ============================================================

showRegisterBtn?.addEventListener("click", () => {
    loginForm?.classList.add("hidden");
    registerForm?.classList.remove("hidden");
    showMessage("");
});


showLoginBtn?.addEventListener("click", () => {
    registerForm?.classList.add("hidden");
    loginForm?.classList.remove("hidden");
    showMessage("");
});


// ============================================================
// REGISTER
// ============================================================

registerBtn?.addEventListener("click", async () => {
    const name = registerName?.value.trim();
    const email = registerEmail?.value.trim();
    const password = registerPassword?.value;
    const confirmPassword = registerConfirmPassword?.value;

    if (!name || !email || !password) {
        showMessage("Please fill in all fields.", "error");
        return;
    }

    if (password !== confirmPassword) {
        showMessage("Passwords do not match.", "error");
        return;
    }

    if (password.length < 6) {
        showMessage(
            "Password must be at least 6 characters.",
            "error"
        );
        return;
    }

    try {
        registerBtn.disabled = true;
        registerBtn.textContent = "Creating account...";

        const credential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        const user = credential.user;

        await set(
            ref(db, `users/${user.uid}`),
            {
                uid: user.uid,
                name,
                email: user.email || email,
                online: true,
                createdAt: Date.now(),
                lastSeen: Date.now()
            }
        );

        showMessage(
            "Account created successfully.",
            "success"
        );

    } catch (error) {
        console.error("Registration error:", error);

        showMessage(
            firebaseErrorMessage(error),
            "error"
        );

    } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = "Register";
    }
});


// ============================================================
// LOGIN
// ============================================================

loginBtn?.addEventListener("click", async () => {
    const email = loginEmail?.value.trim();
    const password = loginPassword?.value;

    if (!email || !password) {
        showMessage(
            "Enter your email and password.",
            "error"
        );
        return;
    }

    try {
        loginBtn.disabled = true;
        loginBtn.textContent = "Signing in...";

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

    } catch (error) {
        console.error("Login error:", error);

        showMessage(
            firebaseErrorMessage(error),
            "error"
        );

    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
    }
});


// ============================================================
// FIREBASE ERRORS
// ============================================================

function firebaseErrorMessage(error) {
    const code = error?.code || "";

    if (
        code.includes("invalid-credential") ||
        code.includes("wrong-password")
    ) {
        return "Incorrect email or password.";
    }

    if (code.includes("invalid-email")) {
        return "Please enter a valid email address.";
    }

    if (code.includes("email-already-in-use")) {
        return "That email is already registered.";
    }

    if (code.includes("weak-password")) {
        return "Password is too weak.";
    }

    if (code.includes("user-not-found")) {
        return "Account not found.";
    }

    if (code.includes("api-key-not-valid")) {
        return "Firebase API key is invalid. Check your Firebase configuration.";
    }

    if (code.includes("permission-denied")) {
        return "Firebase Database permission was denied. Check your Realtime Database rules.";
    }

    return error?.message || "Something went wrong.";
}


// ============================================================
// LOGOUT
// ============================================================

logoutBtn?.addEventListener("click", async () => {
    try {
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
        console.error("Logout error:", error);
    }
});


// ============================================================
// AUTH STATE
// ============================================================

onAuthStateChanged(auth, async user => {
    if (!user) {
        currentUser = null;
        currentProfile = null;

        await cleanupEverything();

        showScreen("auth");
        return;
    }

    currentUser = user;

    try {
        await loadMyProfile();
        await setupPresence();

        showScreen("main");

        updateMyUI();
        listenForUsers();
        listenForIncomingCalls();
        listenForCallHistory();

        setupBrowserNotifications();

    } catch (error) {
        console.error("Auth setup error:", error);

        showNotification(
            "Could not load your account."
        );
    }
});


// ============================================================
// LOAD MY PROFILE
// ============================================================

async function loadMyProfile() {
    if (!currentUser) return;

    const profileRef =
        ref(db, `users/${currentUser.uid}`);

    const snapshot =
        await get(profileRef);

    if (snapshot.exists()) {
        currentProfile = snapshot.val();

    } else {
        currentProfile = {
            uid: currentUser.uid,
            name: currentUser.displayName || "User",
            email: currentUser.email || "",
            online: true,
            createdAt: Date.now(),
            lastSeen: Date.now()
        };

        await set(
            profileRef,
            currentProfile
        );
    }
}


// ============================================================
// UPDATE MY UI
// ============================================================

function updateMyUI() {
    const name =
        currentProfile?.name ||
        currentUser?.email ||
        "User";

    if (welcomeText) {
        welcomeText.textContent =
            `Welcome, ${name}`;
    }

    if (myAvatar) {
        myAvatar.textContent =
            avatarLetter(name);
    }
}


// ============================================================
// PRESENCE
// ============================================================

async function setupPresence() {
    if (!currentUser) return;

    const userRef =
        ref(db, `users/${currentUser.uid}`);

    await update(
        userRef,
        {
            online: true,
            lastSeen: Date.now()
        }
    );

    const disconnectRef =
        onDisconnect(userRef);

    await disconnectRef.update({
        online: false,
        lastSeen: serverTimestamp()
    });
}


// ============================================================
// LISTEN FOR USERS
// ============================================================

function listenForUsers() {
    if (!currentUser || !usersList) return;

    if (usersListener) {
        usersListener();
        usersListener = null;
    }

    usersListener = onValue(
        ref(db, "users"),
        snapshot => {
            usersList.innerHTML = "";

            if (!snapshot.exists()) {
                usersList.innerHTML =
                    "<p>No other users found.</p>";
                return;
            }

            let foundOtherUser = false;

            snapshot.forEach(child => {
                const user = child.val();

                if (!user) return;

                const userId =
                    user.uid || child.key;

                if (!userId) return;

                if (
                    currentUser &&
                    userId === currentUser.uid
                ) {
                    return;
                }

                foundOtherUser = true;

                renderUser({
                    ...user,
                    uid: userId
                });
            });

            if (!foundOtherUser) {
                usersList.innerHTML =
                    "<p>No other users found.</p>";
            }
        },
        error => {
            console.error(
                "Users listener error:",
                error
            );

            showNotification(
                "Could not load users."
            );
        }
    );
}


// ============================================================
// RENDER USER
// ============================================================

function renderUser(user) {
    if (!user || !user.uid) {
        console.warn(
            "Skipping invalid user:",
            user
        );
        return;
    }

    const item =
        document.createElement("div");

    item.className = "user-card";

    const displayName =
        user.name ||
        user.email ||
        "Unknown user";

    const statusText =
        user.online
            ? "Online"
            : "Offline";

    const statusClass =
        user.online
            ? "online"
            : "offline";

    item.innerHTML = `
        <div class="user-avatar">
            ${escapeHTML(
                avatarLetter(displayName)
            )}
        </div>

        <div class="user-details">
            <h3>
                ${escapeHTML(displayName)}
            </h3>

            <p>
                ${escapeHTML(
                    user.email || ""
                )}
            </p>

            <div class="status">
                <span class="status-dot ${statusClass}"></span>
                ${escapeHTML(statusText)}
            </div>
        </div>

        <button
            class="call-user-btn"
            type="button"
            ${user.online ? "" : "disabled"}
        >
            📞 Call
        </button>
    `;

    const callButton =
        item.querySelector(".call-user-btn");

    callButton?.addEventListener(
        "click",
        () => startCall(user)
    );

    usersList.appendChild(item);
}


// ============================================================
// MICROPHONE
// ============================================================

async function getMicrophone() {
    if (localStream) {
        return localStream;
    }

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {
        throw new Error(
            "Microphone access is not supported here. Use HTTPS or localhost."
        );
    }

    localStream =
        await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });

    return localStream;
}


// ============================================================
// CREATE PEER CONNECTION
// ============================================================

function createPeerConnection(role) {
    const pc =
        new RTCPeerConnection(rtcConfig);

    pc.onicecandidate = async event => {
        if (
            !event.candidate ||
            !currentCallId
        ) {
            return;
        }

        try {
            const branch =
                role === "caller"
                    ? "callerCandidates"
                    : "calleeCandidates";

            const candidateRef =
                push(
                    ref(
                        db,
                        `calls/${currentCallId}/${branch}`
                    )
                );

            await set(
                candidateRef,
                event.candidate.toJSON()
            );

        } catch (error) {
            console.error(
                "ICE candidate save error:",
                error
            );
        }
    };


    pc.ontrack = event => {
        console.log(
            "Remote audio received."
        );

        remoteStream =
            event.streams?.[0];

        if (
            remoteAudio &&
            remoteStream
        ) {
            remoteAudio.srcObject =
                remoteStream;

            remoteAudio.volume =
                isSpeakerOn ? 1 : 0;

            remoteAudio.play()
                .catch(error => {
                    console.warn(
                        "Audio autoplay blocked:",
                        error
                    );
                });
        }
    };


    pc.onconnectionstatechange = async () => {
        console.log(
            "WebRTC connection:",
            pc.connectionState
        );

        if (
            pc.connectionState ===
            "connected"
        ) {
            clearTimeout(callTimeout);
            callTimeout = null;

            if (!callStartedAt) {
                callStartedAt =
                    Date.now();
            }

            startCallTimer();

            updateCallStatus(
                "Connected"
            );

            outgoingCallOverlay?.classList.add(
                "hidden"
            );

            callOverlay?.classList.remove(
                "hidden"
            );
        }


        if (
            pc.connectionState ===
            "connecting"
        ) {
            updateCallStatus(
                "Connecting..."
            );
        }


        if (
            pc.connectionState ===
            "disconnected"
        ) {
            updateCallStatus(
                "Connection interrupted..."
            );
        }


        if (
            pc.connectionState ===
            "failed"
        ) {
            updateCallStatus(
                "Connection failed"
            );

            if (
                currentCallId &&
                !isCleaningUp
            ) {
                await endCurrentCall(
                    "failed"
                );
            }
        }


        if (
            pc.connectionState ===
            "closed"
        ) {
            console.log(
                "Peer connection closed."
            );
        }
    };


    pc.oniceconnectionstatechange = () => {
        console.log(
            "ICE state:",
            pc.iceConnectionState
        );
    };

    return pc;
}


// ============================================================
// ADD LOCAL TRACKS
// ============================================================

function addLocalTracks() {
    if (
        !peerConnection ||
        !localStream
    ) {
        return;
    }

    const existingSenders =
        peerConnection.getSenders();

    localStream
        .getTracks()
        .forEach(track => {
            const alreadyAdded =
                existingSenders.some(
                    sender =>
                        sender.track === track
                );

            if (!alreadyAdded) {
                peerConnection.addTrack(
                    track,
                    localStream
                );
            }
        });
}


// ============================================================
// START CALL
// ============================================================

async function startCall(user) {
    console.log(
        "START CALL USER:",
        user
    );

    if (!currentUser) {
        showNotification(
            "You are not logged in."
        );
        return;
    }

    const targetUserId =
        user?.uid ||
        user?.id ||
        null;

    if (!targetUserId) {
        console.error(
            "INVALID USER OBJECT:",
            user
        );

        showNotification(
            "Invalid user. This user's Firebase profile has no UID."
        );

        return;
    }

    if (
        targetUserId ===
        currentUser.uid
    ) {
        showNotification(
            "You cannot call yourself."
        );
        return;
    }

    if (!user.online) {
        showNotification(
            "This user is offline."
        );
        return;
    }

    if (currentCallId) {
        showNotification(
            "You are already on a call."
        );
        return;
    }

    try {
        showNotification(
            "Requesting microphone..."
        );

        await getMicrophone();

        const callRef =
            push(ref(db, "calls"));

        currentCallId =
            callRef.key;

        currentCall = {
            callId: currentCallId,

            callerId:
                currentUser.uid,

            calleeId:
                targetUserId,

            callerName:
                currentProfile?.name ||
                currentUser.email ||
                "User",

            callerEmail:
                currentUser.email ||
                "",

            calleeName:
                user.name ||
                user.email ||
                "User",

            calleeEmail:
                user.email ||
                "",

            status:
                "ringing",

            createdAt:
                Date.now()
        };

        console.log(
            "CALL TARGET UID:",
            targetUserId
        );

        showOutgoingCall(user);

        peerConnection =
            createPeerConnection(
                "caller"
            );

        addLocalTracks();

        const offer =
            await peerConnection.createOffer({
                offerToReceiveAudio: true
            });

        await peerConnection.setLocalDescription(
            offer
        );

        await set(
            callRef,
            {
                ...currentCall,

                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                }
            }
        );

        console.log(
            "CALL CREATED:",
            currentCallId
        );

        listenToCurrentCall();

        callTimeout =
            setTimeout(
                async () => {
                    if (
                        currentCallId &&
                        currentCall?.status ===
                        "ringing"
                    ) {
                        await endCurrentCall(
                            "missed"
                        );
                    }
                },
                30000
            );

    } catch (error) {
        console.error(
            "Start call error:",
            error
        );

        showNotification(
            microphoneError(error)
        );

        await cleanupCall();
    }
}


// ============================================================
// MICROPHONE ERROR
// ============================================================

function microphoneError(error) {
    if (
        error?.name ===
        "NotAllowedError"
    ) {
        return "Microphone permission was denied. Allow microphone access and try again.";
    }

    if (
        error?.name ===
        "NotFoundError"
    ) {
        return "No microphone was found.";
    }

    if (
        error?.name ===
        "NotReadableError"
    ) {
        return "Your microphone is being used by another application.";
    }

    if (
        error?.name ===
        "SecurityError"
    ) {
        return "Microphone access requires HTTPS or localhost.";
    }

    return (
        error?.message ||
        "Could not access microphone."
    );
}


// ============================================================
// LISTEN TO CURRENT CALL
// ============================================================

function listenToCurrentCall() {
    if (!currentCallId) return;

    if (currentCallListener) {
        currentCallListener();
        currentCallListener = null;
    }

    currentCallListener =
        onValue(
            ref(
                db,
                `calls/${currentCallId}`
            ),
            async snapshot => {
                const data =
                    snapshot.val();

                if (!data) return;

                currentCall = {
                    ...data,
                    callId:
                        currentCallId
                };

                if (
                    data.answer &&
                    peerConnection &&
                    !peerConnection.currentRemoteDescription
                ) {
                    try {
                        await peerConnection.setRemoteDescription(
                            new RTCSessionDescription(
                                data.answer
                            )
                        );

                        console.log(
                            "Remote answer applied."
                        );

                        listenForCalleeCandidates();

                    } catch (error) {
                        console.error(
                            "Remote answer error:",
                            error
                        );
                    }
                }

                if (
                    data.status ===
                    "accepted"
                ) {
                    outgoingCallOverlay?.classList.add(
                        "hidden"
                    );

                    callOverlay?.classList.remove(
                        "hidden"
                    );

                    showActiveCall({
                        name:
                            data.calleeName ||
                            data.callerName ||
                            "User",

                        type:
                            "Voice call"
                    });

                    updateCallStatus(
                        "Connecting..."
                    );
                }

                if (
                    data.status ===
                    "rejected"
                ) {
                    showNotification(
                        "Your call was rejected."
                    );

                    await cleanupCall();
                }

                if (
                    data.status ===
                    "cancelled"
                ) {
                    showNotification(
                        "Call cancelled."
                    );

                    await cleanupCall();
                }

                if (
                    data.status ===
                    "missed"
                ) {
                    showNotification(
                        "Call was not answered."
                    );

                    await cleanupCall();
                }

                if (
                    data.status ===
                    "ended"
                ) {
                    showNotification(
                        "Call ended."
                    );

                    await cleanupCall();
                }

                if (
                    data.status ===
                    "failed"
                ) {
                    showNotification(
                        "Call failed."
                    );

                    await cleanupCall();
                }
            }
        );
}


// ============================================================
// LISTEN FOR CALLEE ICE
// ============================================================

function listenForCalleeCandidates() {
    if (
        !currentCallId ||
        !peerConnection
    ) {
        return;
    }

    if (calleeCandidatesListener) {
        calleeCandidatesListener();
        calleeCandidatesListener = null;
    }

    calleeCandidatesListener =
        onChildAdded(
            ref(
                db,
                `calls/${currentCallId}/calleeCandidates`
            ),
            async snapshot => {
                const key =
                    snapshot.key;

                const uniqueKey =
                    `callee-${key}`;

                if (
                    addedCandidateKeys.has(
                        uniqueKey
                    )
                ) {
                    return;
                }

                addedCandidateKeys.add(
                    uniqueKey
                );

                await addIceCandidateSafely(
                    snapshot.val()
                );
            }
        );
}


// ============================================================
// LISTEN FOR CALLER ICE
// ============================================================

function listenForCallerCandidates() {
    if (
        !currentCallId ||
        !peerConnection
    ) {
        return;
    }

    if (callerCandidatesListener) {
        callerCandidatesListener();
        callerCandidatesListener = null;
    }

    callerCandidatesListener =
        onChildAdded(
            ref(
                db,
                `calls/${currentCallId}/callerCandidates`
            ),
            async snapshot => {
                const key =
                    snapshot.key;

                const uniqueKey =
                    `caller-${key}`;

                if (
                    addedCandidateKeys.has(
                        uniqueKey
                    )
                ) {
                    return;
                }

                addedCandidateKeys.add(
                    uniqueKey
                );

                await addIceCandidateSafely(
                    snapshot.val()
                );
            }
        );
}


// ============================================================
// ADD ICE CANDIDATE SAFELY
// ============================================================

async function addIceCandidateSafely(
    candidate
) {
    if (
        !peerConnection ||
        !candidate
    ) {
        return;
    }

    try {
        if (
            !peerConnection.remoteDescription
        ) {
            console.log(
                "Waiting for remote description before adding ICE candidate."
            );
            return;
        }

        await peerConnection.addIceCandidate(
            new RTCIceCandidate(candidate)
        );

    } catch (error) {
        console.error(
            "ICE candidate error:",
            error
        );
    }
}


// ============================================================
// LISTEN FOR INCOMING CALLS
// ============================================================

function listenForIncomingCalls() {
    if (!currentUser) return;

    if (incomingCallsListener) {
        incomingCallsListener();
        incomingCallsListener = null;
    }

    incomingCallsListener =
        onChildAdded(
            ref(db, "calls"),
            snapshot => {
                const call =
                    snapshot.val();

                if (!call) return;

                const callId =
                    snapshot.key;

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

                if (!call.offer) {
                    return;
                }

                if (
                    processedIncomingCalls.has(
                        callId
                    )
                ) {
                    return;
                }

                // Ignore calls older than 35 seconds.
                if (
                    call.createdAt &&
                    Date.now() -
                        Number(call.createdAt) >
                        35000
                ) {
                    return;
                }

                processedIncomingCalls.add(
                    callId
                );

                incomingCall = {
                    ...call,
                    callId
                };

                showIncomingCall(
                    incomingCall
                );
            }
        );
}


// ============================================================
// SHOW INCOMING CALL
// ============================================================

function showIncomingCall(call) {
    if (!call) return;

    const name =
        call.callerName ||
        call.callerEmail ||
        "Unknown caller";

    if (incomingCallerAvatar) {
        incomingCallerAvatar.textContent =
            avatarLetter(name);
    }

    if (incomingCallerName) {
        incomingCallerName.textContent =
            name;
    }

    if (incomingCallerEmail) {
        incomingCallerEmail.textContent =
            call.callerEmail || "";
    }

    incomingCallOverlay?.classList.remove(
        "hidden"
    );

    ringingIndicator?.classList.remove(
        "hidden"
    );

    try {
        if (ringtone) {
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
    } catch (error) {
        console.warn(
            "Ringtone error:",
            error
        );
    }

    showNotification(
        `Incoming call from ${name}`
    );

    notifyIncomingCall(call);
}


// ============================================================
// ACCEPT CALL
// ============================================================

acceptCallBtn?.addEventListener(
    "click",
    async () => {
        if (
            !incomingCall ||
            !incomingCall.callId
        ) {
            return;
        }

        const call =
            incomingCall;

        try {
            ringtone?.pause();

            if (ringtone) {
                ringtone.currentTime = 0;
                ringtone.loop = false;
            }

            incomingCallOverlay?.classList.add(
                "hidden"
            );

            showNotification(
                "Requesting microphone..."
            );

            await getMicrophone();

            currentCallId =
                call.callId;

            currentCall =
                call;

            peerConnection =
                createPeerConnection(
                    "callee"
                );

            addLocalTracks();

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    call.offer
                )
            );

            console.log(
                "Caller offer applied."
            );

            listenForCallerCandidates();

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

            showActiveCall({
                name:
                    call.callerName ||
                    call.callerEmail ||
                    "User",

                type:
                    "Voice call"
            });

            updateCallStatus(
                "Connecting..."
            );

            incomingCall = null;

        } catch (error) {
            console.error(
                "Accept call error:",
                error
            );

            showNotification(
                microphoneError(error)
            );

            await cleanupCall();
        }
    }
);


// ============================================================
// REJECT CALL
// ============================================================

rejectCallBtn?.addEventListener(
    "click",
    async () => {
        if (
            !incomingCall ||
            !incomingCall.callId
        ) {
            return;
        }

        const call =
            incomingCall;

        try {
            ringtone?.pause();

            if (ringtone) {
                ringtone.currentTime = 0;
                ringtone.loop = false;
            }

            await update(
                ref(
                    db,
                    `calls/${call.callId}`
                ),
                {
                    status:
                        "rejected",

                    endedAt:
                        Date.now(),

                    duration:
                        0
                }
            );

            await saveCallHistoryForUser(
                currentUser.uid,
                {
                    callId:
                        call.callId,

                    callerId:
                        call.callerId,

                    calleeId:
                        call.calleeId,

                    callerName:
                        call.callerName ||
                        "User",

                    callerEmail:
                        call.callerEmail ||
                        "",

                    calleeName:
                        call.calleeName ||
                        currentProfile?.name ||
                        "User",

                    calleeEmail:
                        call.calleeEmail ||
                        currentUser.email ||
                        "",

                    status:
                        "rejected",

                    direction:
                        "incoming",

                    duration:
                        0,

                    timestamp:
                        Date.now()
                }
            );

            incomingCallOverlay?.classList.add(
                "hidden"
            );

            incomingCall = null;

        } catch (error) {
            console.error(
                "Reject call error:",
                error
            );
        }
    }
);


// ============================================================
// SHOW OUTGOING CALL
// ============================================================

function showOutgoingCall(user) {
    const name =
        user?.name ||
        user?.email ||
        "User";

    if (outgoingCallerAvatar) {
        outgoingCallerAvatar.textContent =
            avatarLetter(name);
    }

    if (outgoingCallerName) {
        outgoingCallerName.textContent =
            name;
    }

    if (outgoingCallStatus) {
        outgoingCallStatus.textContent =
            "Calling...";
    }

    outgoingCallOverlay?.classList.remove(
        "hidden"
    );

    outgoingRinging?.classList.remove(
        "hidden"
    );
}


// ============================================================
// CANCEL CALL
// ============================================================

cancelCallBtn?.addEventListener(
    "click",
    async () => {
        await endCurrentCall(
            "cancelled"
        );
    }
);


// ============================================================
// SHOW ACTIVE CALL
// ============================================================

function showActiveCall({
    name,
    type
}) {
    outgoingCallOverlay?.classList.add(
        "hidden"
    );

    callOverlay?.classList.remove(
        "hidden"
    );

    if (callAvatar) {
        callAvatar.textContent =
            avatarLetter(name);
    }

    if (callName) {
        callName.textContent =
            name || "User";
    }

    if (callType) {
        callType.textContent =
            type || "Voice call";
    }

    if (callStatus) {
        callStatus.textContent =
            "Connecting...";
    }

    if (callTimer) {
        callTimer.textContent =
            "00:00";
    }
}


// ============================================================
// UPDATE CALL STATUS
// ============================================================

function updateCallStatus(status) {
    if (callStatus) {
        callStatus.textContent =
            status;
    }

    if (
        outgoingCallStatus &&
        !outgoingCallOverlay?.classList.contains(
            "hidden"
        )
    ) {
        outgoingCallStatus.textContent =
            status;
    }
}


// ============================================================
// START CALL TIMER
// ============================================================

function startCallTimer() {
    if (callTimerInterval) {
        return;
    }

    if (!callStartedAt) {
        callStartedAt =
            Date.now();
    }

    callTimerInterval =
        setInterval(() => {
            if (!callStartedAt) {
                return;
            }

            const elapsed =
                Math.floor(
                    (Date.now() -
                        callStartedAt) /
                    1000
                );

            if (callTimer) {
                callTimer.textContent =
                    formatTime(elapsed);
            }
        }, 1000);
}


// ============================================================
// END CALL BUTTON
// ============================================================

endCallBtn?.addEventListener(
    "click",
    async () => {
        await endCurrentCall(
            "completed"
        );
    }
);


// ============================================================
// END CURRENT CALL
// ============================================================

async function endCurrentCall(reason) {
    if (!currentCallId) {
        await cleanupCall();
        return;
    }

    const callId =
        currentCallId;

    const callData =
        currentCall || {};

    const duration =
        callStartedAt
            ? Math.max(
                0,
                Math.floor(
                    (Date.now() -
                        callStartedAt) /
                    1000
                )
            )
            : 0;

    let status =
        reason;

    if (reason === "completed") {
        status = "ended";
    }

    if (reason === "timeout") {
        status = "missed";
    }

    if (reason === "connection-failed") {
        status = "failed";
    }

    try {
        await update(
            ref(
                db,
                `calls/${callId}`
            ),
            {
                status,
                endedAt:
                    Date.now(),
                duration
            }
        );
    } catch (error) {
        console.error(
            "End call database error:",
            error
        );
    }


    if (currentUser) {
        const direction =
            callData.callerId ===
            currentUser.uid
                ? "outgoing"
                : "incoming";

        await saveCallHistoryForUser(
            currentUser.uid,
            {
                callId,

                callerId:
                    callData.callerId ||
                    "",

                calleeId:
                    callData.calleeId ||
                    "",

                callerName:
                    callData.callerName ||
                    "User",

                callerEmail:
                    callData.callerEmail ||
                    "",

                calleeName:
                    callData.calleeName ||
                    "User",

                calleeEmail:
                    callData.calleeEmail ||
                    "",

                status,

                direction,

                duration,

                timestamp:
                    Date.now()
            }
        );
    }

    await cleanupCall();
}


// ============================================================
// SAVE CALL HISTORY
// ============================================================

async function saveCallHistoryForUser(
    uid,
    data
) {
    if (!uid || !data?.callId) {
        return;
    }

    try {
        await set(
            ref(
                db,
                `callHistory/${uid}/${data.callId}`
            ),
            data
        );
    } catch (error) {
        console.error(
            "Save call history error:",
            error
        );
    }
}


// ============================================================
// LISTEN FOR CALL HISTORY
// ============================================================

function listenForCallHistory() {
    if (
        !currentUser ||
        !callHistory
    ) {
        return;
    }

    if (callHistoryListener) {
        callHistoryListener();
        callHistoryListener = null;
    }

    callHistoryListener =
        onValue(
            ref(
                db,
                `callHistory/${currentUser.uid}`
            ),
            snapshot => {
                callHistory.innerHTML = "";

                if (!snapshot.exists()) {
                    callHistory.innerHTML =
                        "<p>No calls yet.</p>";
                    return;
                }

                const calls = [];

                snapshot.forEach(child => {
                    const data =
                        child.val();

                    if (!data) return;

                    calls.push({
                        ...data,
                        callId:
                            data.callId ||
                            child.key
                    });
                });

                calls.sort(
                    (a, b) =>
                        Number(b.timestamp || 0) -
                        Number(a.timestamp || 0)
                );

                calls.forEach(call => {
                    renderHistoryItem(
                        call,
                        callHistory
                    );
                });
            },
            error => {
                console.error(
                    "Call history listener error:",
                    error
                );
            }
        );
}


// ============================================================
// RENDER CALL HISTORY
// ============================================================

function renderHistoryItem(
    call,
    container
) {
    const item =
        document.createElement("div");

    item.className =
        "call-history-item";

    const isIncoming =
        call.direction ===
        "incoming";

    const icon =
        isIncoming
            ? "📥"
            : "📤";

    const otherName =
        isIncoming
            ? (
                call.callerName ||
                call.callerEmail ||
                "Unknown"
            )
            : (
                call.calleeName ||
                call.calleeEmail ||
                "Unknown"
            );

    let statusText =
        call.status || "unknown";

    if (statusText === "ended") {
        statusText =
            "Completed";
    } else if (
        statusText === "rejected"
    ) {
        statusText =
            "Rejected";
    } else if (
        statusText === "missed"
    ) {
        statusText =
            "Missed";
    } else if (
        statusText === "cancelled"
    ) {
        statusText =
            "Cancelled";
    } else if (
        statusText === "failed"
    ) {
        statusText =
            "Failed";
    }

    const date =
        call.timestamp
            ? new Date(
                Number(call.timestamp)
            ).toLocaleString()
            : "";

    item.innerHTML = `
        <div class="history-icon">
            ${icon}
        </div>

        <div class="history-details">
            <h3>
                ${escapeHTML(otherName)}
            </h3>

            <p>
                ${escapeHTML(statusText)}
            </p>

            <small>
                ${escapeHTML(date)}
            </small>
        </div>

        <div class="history-duration">
            ${formatTime(call.duration || 0)}
        </div>
    `;

    container.appendChild(item);
}


// ============================================================
// MUTE
// ============================================================

muteBtn?.addEventListener(
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

        muteBtn.textContent =
            isMuted
                ? "🔇 Unmute"
                : "🎤 Mute";
    }
);


// ============================================================
// SPEAKER
// ============================================================

speakerBtn?.addEventListener(
    "click",
    () => {
        isSpeakerOn =
            !isSpeakerOn;

        if (remoteAudio) {
            remoteAudio.volume =
                isSpeakerOn
                    ? 1
                    : 0;
        }

        speakerBtn.textContent =
            isSpeakerOn
                ? "🔊 Speaker"
                : "🔇 Speaker";
    }
);


// ============================================================
// CLEANUP CALL
// ============================================================

async function cleanupCall() {
    if (isCleaningUp) {
        return;
    }

    isCleaningUp = true;

    try {
        clearTimeout(callTimeout);
        callTimeout = null;

        clearInterval(
            callTimerInterval
        );
        callTimerInterval = null;

        if (currentCallListener) {
            currentCallListener();
            currentCallListener = null;
        }

        if (callerCandidatesListener) {
            callerCandidatesListener();
            callerCandidatesListener = null;
        }

        if (calleeCandidatesListener) {
            calleeCandidatesListener();
            calleeCandidatesListener = null;
        }


        if (peerConnection) {
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.oniceconnectionstatechange = null;

            try {
                peerConnection.close();
            } catch (error) {
                console.warn(
                    "Peer close error:",
                    error
                );
            }
        }

        peerConnection = null;


        if (localStream) {
            localStream
                .getTracks()
                .forEach(track => {
                    try {
                        track.stop();
                    } catch (error) {
                        console.warn(
                            "Track stop error:",
                            error
                        );
                    }
                });
        }

        localStream = null;


        if (remoteAudio) {
            remoteAudio.pause();
            remoteAudio.srcObject = null;
        }

        remoteStream = null;


        if (ringtone) {
            ringtone.pause();
            ringtone.currentTime = 0;
            ringtone.loop = false;
        }


        incomingCallOverlay?.classList.add(
            "hidden"
        );

        outgoingCallOverlay?.classList.add(
            "hidden"
        );

        callOverlay?.classList.add(
            "hidden"
        );


        currentCallId = null;
        currentCall = null;
        incomingCall = null;

        callStartedAt = null;

        isMuted = false;
        isSpeakerOn = true;

        addedCandidateKeys.clear();


        if (muteBtn) {
            muteBtn.textContent =
                "🎤 Mute";
        }

        if (speakerBtn) {
            speakerBtn.textContent =
                "🔊 Speaker";
        }

        if (callTimer) {
            callTimer.textContent =
                "00:00";
        }

    } finally {
        isCleaningUp = false;
    }
}


// ============================================================
// CLEANUP EVERYTHING
// ============================================================

async function cleanupEverything() {
    await cleanupCall();

    if (usersListener) {
        usersListener();
        usersListener = null;
    }

    if (incomingCallsListener) {
        incomingCallsListener();
        incomingCallsListener = null;
    }

    if (callHistoryListener) {
        callHistoryListener();
        callHistoryListener = null;
    }

    processedIncomingCalls.clear();
}


// ============================================================
// BROWSER NOTIFICATIONS
// ============================================================

async function setupBrowserNotifications() {
    if (
        !("Notification" in window)
    ) {
        return;
    }

    if (
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


function showBrowserNotification(
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
                body
            }
        );
    } catch (error) {
        console.warn(
            "Browser notification error:",
            error
        );
    }
}


function notifyIncomingCall(call) {
    const name =
        call?.callerName ||
        call?.callerEmail ||
        "Someone";

    showBrowserNotification(
        "Incoming voice call",
        `${name} is calling you.`
    );
}


// ============================================================
// INITIAL SCREEN
// ============================================================

showScreen("auth");

console.log(
    "VOICE CHAT APP INITIALIZED"
);