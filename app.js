// ============================================================
// VOICE CHAT APP - app.js
// ============================================================

// -------------------------
// FIREBASE IMPORTS
// -------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
    getDatabase,
    ref,
    get,
    set,
    update,
    remove,
    onValue,
    onChildAdded,
    onChildChanged,
    onChildRemoved,
    onDisconnect,
    push,
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
let remoteStream = null;

let currentCallId = null;
let currentCallType = null;
let currentOtherUser = null;

let incomingCallData = null;

let usersListener = null;
let callsListener = null;
let historyListener = null;

let callerCandidatesListener = null;
let calleeCandidatesListener = null;

let callTimerInterval = null;
let callStartTime = null;

let isMuted = false;
let isSpeakerOn = true;

let pendingRemoteCandidates = [];

let notificationPermissionAsked = false;


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
// DOM HELPER
// ============================================================

function $(id) {
    return document.getElementById(id);
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// AVATAR
// ============================================================

function avatarLetter(name) {
    const text = String(name || "U").trim();

    return escapeHTML(
        text.charAt(0).toUpperCase() || "U"
    );
}


// ============================================================
// TIME
// ============================================================

function formatTime(timestamp) {
    if (!timestamp) return "";

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}


function formatDuration(seconds) {
    seconds = Number(seconds || 0);

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
        remainingSeconds
    ).padStart(2, "0")}`;
}


// ============================================================
// NOTIFICATION
// ============================================================

function showNotification(message) {
    console.log("NOTIFICATION:", message);

    const notification = $("notification");

    if (!notification) {
        alert(message);
        return;
    }

    notification.textContent = message;
    notification.classList.add("show");

    clearTimeout(notification._timeout);

    notification._timeout = setTimeout(() => {
        notification.classList.remove("show");
    }, 4000);
}


// ============================================================
// SCREEN
// ============================================================

function showScreen(screen) {
    const authSection = $("authSection");
    const mainSection = $("mainSection");

    if (authSection) {
        authSection.style.display =
            screen === "auth" ? "" : "none";
    }

    if (mainSection) {
        mainSection.style.display =
            screen === "main" ? "" : "none";
    }
}


// ============================================================
// AUTH MESSAGE
// ============================================================

function showAuthMessage(message, isError = false) {
    const element = $("authMessage");

    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "red" : "";
}


// ============================================================
// GET ELEMENT VALUE
// ============================================================

function valueOf(id) {
    const element = $(id);
    return element ? element.value.trim() : "";
}


// ============================================================
// REGISTER
// ============================================================

async function registerUser(event) {
    if (event) event.preventDefault();

    const name = valueOf("registerName");
    const email = valueOf("registerEmail");
    const password = valueOf("registerPassword");
    const confirmPassword = valueOf("registerConfirmPassword");

    if (!name) {
        showAuthMessage("Please enter your name.", true);
        return;
    }

    if (!email) {
        showAuthMessage("Please enter your email.", true);
        return;
    }

    if (!password) {
        showAuthMessage("Please enter a password.", true);
        return;
    }

    if (password.length < 6) {
        showAuthMessage(
            "Password must be at least 6 characters.",
            true
        );
        return;
    }

    if (password !== confirmPassword) {
        showAuthMessage(
            "Passwords do not match.",
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
        const credential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        await updateProfile(credential.user, {
            displayName: name
        });

        const user = credential.user;

        const userRef = ref(db, `users/${user.uid}`);

        const profile = {
            uid: user.uid,
            name: name,
            email: user.email || email,
            online: true,
            createdAt: Date.now(),
            lastSeen: Date.now()
        };

        await set(userRef, profile);

        currentUser = user;
        currentProfile = profile;

        showAuthMessage("Account created successfully.");

        console.log("REGISTER SUCCESS:", user.uid);

    } catch (error) {
        console.error("REGISTER ERROR:", error);
        console.error("ERROR CODE:", error.code);
        console.error("ERROR MESSAGE:", error.message);

        showAuthMessage(
            error.message || "Could not create account.",
            true
        );
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Create Account";
        }
    }
}


// ============================================================
// LOGIN
// ============================================================

async function loginUser(event) {
    if (event) event.preventDefault();

    const email = valueOf("loginEmail");
    const password = valueOf("loginPassword");

    if (!email || !password) {
        showAuthMessage(
            "Please enter your email and password.",
            true
        );
        return;
    }

    const button = $("loginBtn");

    if (button) {
        button.disabled = true;
        button.textContent = "Logging in...";
    }

    try {
        const credential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        console.log(
            "LOGIN SUCCESS:",
            credential.user.uid
        );

        showAuthMessage("Login successful.");

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        console.error("ERROR CODE:", error.code);
        console.error("ERROR MESSAGE:", error.message);

        showAuthMessage(
            error.message || "Could not log in.",
            true
        );
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Login";
        }
    }
}


// ============================================================
// LOGOUT
// ============================================================

async function logoutUser() {
    try {
        await cleanupEverything();
        await signOut(auth);
    } catch (error) {
        console.error("LOGOUT ERROR:", error);
        showNotification(
            error.message || "Could not log out."
        );
    }
}


// ============================================================
// LOAD PROFILE
// ============================================================

async function loadMyProfile() {
    if (!currentUser) {
        throw new Error("No authenticated user.");
    }

    const profileRef =
        ref(db, `users/${currentUser.uid}`);

    const snapshot = await get(profileRef);

    if (snapshot.exists()) {
        currentProfile = snapshot.val();
        return;
    }

    currentProfile = {
        uid: currentUser.uid,
        name: currentUser.displayName || "User",
        email: currentUser.email || "",
        online: true,
        createdAt: Date.now(),
        lastSeen: Date.now()
    };

    await set(profileRef, currentProfile);
}


// ============================================================
// PRESENCE
// ============================================================

async function setupPresence() {
    if (!currentUser) {
        throw new Error("No authenticated user.");
    }

    const userRef =
        ref(db, `users/${currentUser.uid}`);

    await update(userRef, {
        online: true,
        lastSeen: Date.now()
    });

    const disconnectRef =
        onDisconnect(userRef);

    await disconnectRef.update({
        online: false,
        lastSeen: serverTimestamp()
    });
}


// ============================================================
// UPDATE MY UI
// ============================================================

function updateMyUI() {
    if (!currentProfile) return;

    const welcomeText = $("welcomeText");
    const myAvatar = $("myAvatar");

    if (welcomeText) {
        welcomeText.textContent =
            `Welcome, ${currentProfile.name || "User"}`;
    }

    if (myAvatar) {
        myAvatar.textContent =
            avatarLetter(currentProfile.name);
    }
}


// ============================================================
// USERS
// ============================================================

function listenForUsers() {
    const usersRef = ref(db, "users");

    if (usersListener) {
        usersListener();
    }

    usersListener = onValue(
        usersRef,
        snapshot => {
            const users = [];

            snapshot.forEach(child => {
                const user = child.val();

                if (
                    user &&
                    user.uid &&
                    currentUser &&
                    user.uid !== currentUser.uid
                ) {
                    users.push(user);
                }
            });

            renderUsers(users);
        },
        error => {
            console.error("USERS ERROR:", error);
            console.error("ERROR CODE:", error.code);
            console.error("ERROR MESSAGE:", error.message);

            showNotification(
                `Could not load users: ${error.message}`
            );
        }
    );
}


// ============================================================
// RENDER USERS
// ============================================================

function renderUsers(users) {
    const usersList = $("usersList");

    if (!usersList) return;

    usersList.innerHTML = "";

    if (!users.length) {
        usersList.innerHTML =
            "<p>No other users found.</p>";
        return;
    }

    users.sort((a, b) =>
        String(a.name || "").localeCompare(
            String(b.name || "")
        )
    );

    users.forEach(user => {
        const item =
            document.createElement("div");

        item.className = "user-item";

        const onlineText =
            user.online ? "Online" : "Offline";

        item.innerHTML = `
            <div class="user-avatar">
                ${avatarLetter(user.name)}
            </div>

            <div class="user-info">
                <div class="user-name">
                    ${escapeHTML(user.name || "User")}
                </div>

                <div class="user-email">
                    ${escapeHTML(user.email || "")}
                </div>

                <div class="user-status">
                    ${onlineText}
                </div>
            </div>

            <button class="call-user-btn">
                Call
            </button>
        `;

        const callButton =
            item.querySelector(".call-user-btn");

        if (callButton) {
            callButton.addEventListener(
                "click",
                () => startCall(user)
            );
        }

        usersList.appendChild(item);
    });
}


// ============================================================
// CREATE PEER CONNECTION
// ============================================================

function createPeerConnection(role) {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection =
        new RTCPeerConnection(
            rtcConfiguration
        );

    peerConnection.onicecandidate =
        event => {
            if (!event.candidate) return;

            handleLocalIceCandidate(
                role,
                event.candidate
            );
        };

    peerConnection.ontrack =
        event => {
            if (!remoteStream) {
                remoteStream =
                    new MediaStream();
            }

            event.streams.forEach(stream => {
                stream.getTracks().forEach(track => {
                    if (
                        !remoteStream
                            .getTracks()
                            .some(
                                existing =>
                                    existing.id ===
                                    track.id
                            )
                    ) {
                        remoteStream.addTrack(track);
                    }
                });
            });

            const remoteAudio =
                $("remoteAudio");

            if (remoteAudio) {
                remoteAudio.srcObject =
                    remoteStream;

                remoteAudio.play().catch(
                    error => {
                        console.warn(
                            "Remote audio play requires user interaction:",
                            error
                        );
                    }
                );
            }
        };

    peerConnection.onconnectionstatechange =
        () => {
            if (!peerConnection) return;

            console.log(
                "WebRTC connection state:",
                peerConnection.connectionState
            );

            if (
                peerConnection.connectionState ===
                "connected"
            ) {
                setCallStatus("Connected");
            }

            if (
                peerConnection.connectionState ===
                "failed"
            ) {
                setCallStatus("Connection failed");
                showNotification(
                    "The call connection failed."
                );
            }

            if (
                peerConnection.connectionState ===
                "disconnected"
            ) {
                setCallStatus("Disconnected");
            }
        };

    return peerConnection;
}


// ============================================================
// LOCAL ICE CANDIDATE
// ============================================================

async function handleLocalIceCandidate(
    role,
    candidate
) {
    if (!currentCallId) return;

    try {
        const path =
            role === "caller"
                ? `calls/${currentCallId}/callerCandidates`
                : `calls/${currentCallId}/calleeCandidates`;

        const candidateRef =
            push(ref(db, path));

        await set(
            candidateRef,
            candidate.toJSON()
        );

    } catch (error) {
        console.error(
            "SAVE ICE CANDIDATE ERROR:",
            error
        );
    }
}


// ============================================================
// ADD REMOTE ICE CANDIDATE
// ============================================================

async function addIceCandidateSafely(
    candidate
) {
    if (!peerConnection || !candidate) {
        return;
    }

    if (!peerConnection.remoteDescription) {
        pendingRemoteCandidates.push(candidate);
        return;
    }

    try {
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
// FLUSH QUEUED ICE
// ============================================================

async function flushPendingCandidates() {
    if (
        !peerConnection ||
        !peerConnection.remoteDescription
    ) {
        return;
    }

    while (pendingRemoteCandidates.length) {
        const candidate =
            pendingRemoteCandidates.shift();

        try {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(candidate)
            );
        } catch (error) {
            console.error(
                "Queued ICE candidate error:",
                error
            );
        }
    }
}


// ============================================================
// MICROPHONE
// ============================================================

async function getMicrophone() {
    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {
        throw new Error(
            "Your browser does not support microphone access."
        );
    }

    try {
        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

        return stream;

    } catch (error) {
        console.error(
            "MICROPHONE ERROR:",
            error
        );

        if (error.name === "NotAllowedError") {
            throw new Error(
                "Microphone permission was denied."
            );
        }

        if (error.name === "NotFoundError") {
            throw new Error(
                "No microphone was found."
            );
        }

        throw error;
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
        peerConnection ||
        currentCallId
    ) {
        showNotification(
            "You are already in a call."
        );
        return;
    }

    currentOtherUser = user;
    currentCallType = "outgoing";

    try {
        showOutgoingCall(user);

        localStream =
            await getMicrophone();

        createPeerConnection("caller");

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

        const offer =
            await peerConnection.createOffer();

        await peerConnection.setLocalDescription(
            offer
        );

        const callData = {
            callerId: currentUser.uid,
            callerName:
                currentProfile?.name ||
                currentUser.displayName ||
                "User",
            callerEmail:
                currentUser.email || "",

            calleeId: user.uid,
            calleeName:
                user.name || "User",
            calleeEmail:
                user.email || "",

            status: "ringing",

            offer: {
                type: offer.type,
                sdp: offer.sdp
            },

            createdAt: serverTimestamp()
        };

        await set(
            callRef,
            callData
        );

        listenForAnswer();
        listenForCalleeCandidates();

        setOutgoingStatus(
            "Ringing..."
        );

        console.log(
            "CALL STARTED:",
            currentCallId
        );

    } catch (error) {
        console.error(
            "START CALL ERROR:",
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
            `Could not start call: ${
                error?.message || "Unknown error"
            }`
        );

        await endCall("failed");
    }
}


// ============================================================
// LISTEN FOR ANSWER
// ============================================================

function listenForAnswer() {
    if (!currentCallId) return;

    const callRef =
        ref(db, `calls/${currentCallId}`);

    onValue(
        callRef,
        async snapshot => {
            const data = snapshot.val();

            if (!data) return;

            if (
                data.answer &&
                peerConnection &&
                !peerConnection.remoteDescription
            ) {
                try {
                    await peerConnection.setRemoteDescription(
                        new RTCSessionDescription(
                            data.answer
                        )
                    );

                    await flushPendingCandidates();

                    console.log(
                        "ANSWER RECEIVED"
                    );

                } catch (error) {
                    console.error(
                        "SET ANSWER ERROR:",
                        error
                    );
                }
            }

            if (data.status === "rejected") {
                showNotification(
                    "Call was rejected."
                );

                await endCall("rejected");
            }

            if (data.status === "cancelled") {
                showNotification(
                    "Call was cancelled."
                );

                await endCall("cancelled");
            }

            if (data.status === "ended") {
                await endCall("ended");
            }
        },
        error => {
            console.error(
                "ANSWER LISTENER ERROR:",
                error
            );
        }
    );
}


// ============================================================
// LISTEN FOR CALLEE ICE
// ============================================================

function listenForCalleeCandidates() {
    if (!currentCallId) return;

    const candidatesRef =
        ref(
            db,
            `calls/${currentCallId}/calleeCandidates`
        );

    calleeCandidatesListener =
        onChildAdded(
            candidatesRef,
            snapshot => {
                const candidate =
                    snapshot.val();

                addIceCandidateSafely(
                    candidate
                );
            }
        );
}


// ============================================================
// INCOMING CALLS
// ============================================================

function listenForIncomingCalls() {
    const callsRef =
        ref(db, "calls");

    if (callsListener) {
        callsListener();
    }

    callsListener =
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
                    call.status !== "ringing"
                ) {
                    return;
                }

                if (currentCallId) {
                    return;
                }

                currentCallId =
                    snapshot.key;

                incomingCallData =
                    call;

                showIncomingCall(call);

                playRingtone();
            },
            error => {
                console.error(
                    "INCOMING CALL ERROR:",
                    error
                );

                console.error(
                    "ERROR CODE:",
                    error.code
                );

                console.error(
                    "ERROR MESSAGE:",
                    error.message
                );

                showNotification(
                    `Could not listen for calls: ${error.message}`
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

    const email =
        $("incomingCallerEmail");

    if (avatar) {
        avatar.textContent =
            avatarLetter(
                call.callerName
            );
    }

    if (name) {
        name.textContent =
            call.callerName ||
            "Unknown caller";
    }

    if (email) {
        email.textContent =
            call.callerEmail || "";
    }

    if (overlay) {
        overlay.style.display = "";
    }
}


// ============================================================
// ACCEPT CALL
// ============================================================

async function acceptCall() {
    if (
        !incomingCallData ||
        !currentCallId
    ) {
        return;
    }

    stopRingtone();

    const call =
        incomingCallData;

    currentOtherUser = {
        uid: call.callerId,
        name: call.callerName,
        email: call.callerEmail
    };

    try {
        hideIncomingCall();

        setCallType("Incoming call");

        localStream =
            await getMicrophone();

        createPeerConnection("callee");

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

        await flushPendingCandidates();

        listenForCallerCandidates();

        const answer =
            await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(
            answer
        );

        await update(
            ref(
                db,
                `calls/${currentCallId}`
            ),
            {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                status: "accepted",
                acceptedAt: serverTimestamp()
            }
        );

        showActiveCall();
        startCallTimer();

        console.log(
            "CALL ACCEPTED:",
            currentCallId
        );

    } catch (error) {
        console.error(
            "ACCEPT CALL ERROR:",
            error
        );

        showNotification(
            `Could not accept call: ${
                error.message || "Unknown error"
            }`
        );

        await endCall("failed");
    }
}


// ============================================================
// LISTEN FOR CALLER ICE
// ============================================================

function listenForCallerCandidates() {
    if (!currentCallId) return;

    const candidatesRef =
        ref(
            db,
            `calls/${currentCallId}/callerCandidates`
        );

    callerCandidatesListener =
        onChildAdded(
            candidatesRef,
            snapshot => {
                const candidate =
                    snapshot.val();

                addIceCandidateSafely(
                    candidate
                );
            }
        );
}


// ============================================================
// REJECT CALL
// ============================================================

async function rejectCall() {
    stopRingtone();

    if (!currentCallId) {
        hideIncomingCall();
        return;
    }

    try {
        await update(
            ref(
                db,
                `calls/${currentCallId}`
            ),
            {
                status: "rejected",
                endedAt: serverTimestamp()
            }
        );

        await saveCallHistoryForBoth(
            "rejected",
            0
        );

    } catch (error) {
        console.error(
            "REJECT CALL ERROR:",
            error
        );
    }

    hideIncomingCall();

    incomingCallData = null;
    currentCallId = null;
    currentOtherUser = null;
}


// ============================================================
// CANCEL OUTGOING CALL
// ============================================================

async function cancelOutgoingCall() {
    if (!currentCallId) return;

    try {
        await update(
            ref(
                db,
                `calls/${currentCallId}`
            ),
            {
                status: "cancelled",
                endedAt: serverTimestamp()
            }
        );
    } catch (error) {
        console.error(
            "CANCEL CALL ERROR:",
            error
        );
    }

    await endCall("cancelled");
}


// ============================================================
// END CALL
// ============================================================

async function endCall(status = "ended") {
    const callId =
        currentCallId;

    const otherUser =
        currentOtherUser;

    const wasActive =
        !!callStartTime;

    const duration =
        wasActive
            ? Math.floor(
                (Date.now() -
                    callStartTime) /
                    1000
            )
            : 0;

    stopRingtone();
    stopCallTimer();

    try {
        if (
            callId &&
            currentUser
        ) {
            const callRef =
                ref(
                    db,
                    `calls/${callId}`
                );

            const snapshot =
                await get(callRef);

            if (snapshot.exists()) {
                const call =
                    snapshot.val();

                const finalStatus =
                    status || "ended";

                if (
                    call.status !==
                    "rejected" &&
                    call.status !==
                    "cancelled"
                ) {
                    await update(
                        callRef,
                        {
                            status: finalStatus,
                            endedAt:
                                serverTimestamp()
                        }
                    );
                }

                await saveCallHistoryFromCall(
                    call,
                    finalStatus,
                    duration
                );
            }
        }
    } catch (error) {
        console.error(
            "END CALL DATABASE ERROR:",
            error
        );
    }

    cleanupWebRTC();

    hideAllCallOverlays();

    currentCallId = null;
    currentOtherUser = null;
    currentCallType = null;
    incomingCallData = null;

    isMuted = false;
    isSpeakerOn = true;
}


// ============================================================
// CLEANUP WEBRTC
// ============================================================

function cleanupWebRTC() {
    pendingRemoteCandidates = [];

    if (callerCandidatesListener) {
        callerCandidatesListener();
        callerCandidatesListener = null;
    }

    if (calleeCandidatesListener) {
        calleeCandidatesListener();
        calleeCandidatesListener = null;
    }

    if (localStream) {
        localStream
            .getTracks()
            .forEach(track => {
                track.stop();
            });

        localStream = null;
    }

    if (remoteStream) {
        remoteStream
            .getTracks()
            .forEach(track => {
                track.stop();
            });

        remoteStream = null;
    }

    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
        peerConnection = null;
    }

    const remoteAudio =
        $("remoteAudio");

    if (remoteAudio) {
        remoteAudio.srcObject = null;
    }
}


// ============================================================
// CLEAN EVERYTHING
// ============================================================

async function cleanupEverything() {
    stopRingtone();
    stopCallTimer();

    cleanupWebRTC();

    hideAllCallOverlays();

    currentCallId = null;
    currentOtherUser = null;
    currentCallType = null;
    incomingCallData = null;

    if (usersListener) {
        usersListener();
        usersListener = null;
    }

    if (callsListener) {
        callsListener();
        callsListener = null;
    }

    if (historyListener) {
        historyListener();
        historyListener = null;
    }
}


// ============================================================
// CALL UI
// ============================================================

function showOutgoingCall(user) {
    const overlay =
        $("outgoingCallOverlay");

    const avatar =
        $("outgoingCallerAvatar");

    const name =
        $("outgoingCallerName");

    const status =
        $("outgoingCallStatus");

    if (avatar) {
        avatar.textContent =
            avatarLetter(user.name);
    }

    if (name) {
        name.textContent =
            user.name || "User";
    }

    if (status) {
        status.textContent =
            "Calling...";
    }

    if (overlay) {
        overlay.style.display = "";
    }
}


function setOutgoingStatus(status) {
    const element =
        $("outgoingCallStatus");

    if (element) {
        element.textContent = status;
    }
}


function hideOutgoingCall() {
    const overlay =
        $("outgoingCallOverlay");

    if (overlay) {
        overlay.style.display = "none";
    }
}


function hideIncomingCall() {
    const overlay =
        $("incomingCallOverlay");

    if (overlay) {
        overlay.style.display = "none";
    }
}


function showActiveCall() {
    hideOutgoingCall();
    hideIncomingCall();

    const overlay =
        $("callOverlay");

    if (overlay) {
        overlay.style.display = "";
    }

    const avatar =
        $("callAvatar");

    const name =
        $("callName");

    if (avatar) {
        avatar.textContent =
            avatarLetter(
                currentOtherUser?.name
            );
    }

    if (name) {
        name.textContent =
            currentOtherUser?.name ||
            "User";
    }

    setCallStatus("Connecting...");

    startCallTimer();
}


function hideActiveCall() {
    const overlay =
        $("callOverlay");

    if (overlay) {
        overlay.style.display = "none";
    }
}


function hideAllCallOverlays() {
    hideIncomingCall();
    hideOutgoingCall();
    hideActiveCall();
}


// ============================================================
// CALL TYPE / STATUS
// ============================================================

function setCallType(type) {
    const element =
        $("callType");

    if (element) {
        element.textContent = type;
    }
}


function setCallStatus(status) {
    const element =
        $("callStatus");

    if (element) {
        element.textContent = status;
    }
}


// ============================================================
// CALL TIMER
// ============================================================

function startCallTimer() {
    if (callTimerInterval) return;

    callStartTime = Date.now();

    const timer =
        $("callTimer");

    if (timer) {
        timer.textContent =
            "00:00";
    }

    callTimerInterval =
        setInterval(() => {
            if (!callStartTime) return;

            const seconds =
                Math.floor(
                    (Date.now() -
                        callStartTime) /
                        1000
                );

            if (timer) {
                timer.textContent =
                    formatDuration(seconds);
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

    callStartTime = null;
}


// ============================================================
// MUTE
// ============================================================

function toggleMute() {
    if (!localStream) return;

    const audioTracks =
        localStream.getAudioTracks();

    if (!audioTracks.length) return;

    isMuted = !isMuted;

    audioTracks.forEach(track => {
        track.enabled = !isMuted;
    });

    const button =
        $("muteBtn");

    if (button) {
        button.textContent =
            isMuted ? "Unmute" : "Mute";

        button.classList.toggle(
            "active",
            isMuted
        );
    }

    setCallStatus(
        isMuted ? "Muted" : "Connected"
    );
}


// ============================================================
// SPEAKER
// ============================================================

function toggleSpeaker() {
    const remoteAudio =
        $("remoteAudio");

    if (!remoteAudio) return;

    isSpeakerOn = !isSpeakerOn;

    remoteAudio.muted =
        !isSpeakerOn;

    const button =
        $("speakerBtn");

    if (button) {
        button.textContent =
            isSpeakerOn
                ? "Speaker"
                : "Speaker Off";
    }
}


// ============================================================
// RINGTONE
// ============================================================

function playRingtone() {
    const ringtone =
        $("ringtone");

    if (!ringtone) return;

    ringtone.currentTime = 0;

    ringtone.play().catch(
        error => {
            console.warn(
                "Ringtone could not autoplay:",
                error
            );
        }
    );
}


function stopRingtone() {
    const ringtone =
        $("ringtone");

    if (!ringtone) return;

    ringtone.pause();
    ringtone.currentTime = 0;
}


// ============================================================
// CALL HISTORY
// ============================================================

async function saveCallHistoryForUser(
    userId,
    data
) {
    if (!userId) return;

    const historyRef =
        push(
            ref(
                db,
                `callHistory/${userId}`
            )
        );

    await set(
        historyRef,
        data
    );
}


async function saveCallHistoryFromCall(
    call,
    status,
    duration
) {
    if (!call) return;

    const timestamp =
        Date.now();

    const baseData = {
        callId:
            currentCallId || "",
        callerId:
            call.callerId || "",
        callerName:
            call.callerName || "",
        callerEmail:
            call.callerEmail || "",
        calleeId:
            call.calleeId || "",
        calleeName:
            call.calleeName || "",
        calleeEmail:
            call.calleeEmail || "",
        status:
            status || "ended",
        duration:
            Number(duration || 0),
        timestamp
    };

    try {
        if (call.callerId) {
            await saveCallHistoryForUser(
                call.callerId,
                baseData
            );
        }

        if (
            call.calleeId &&
            call.calleeId !== call.callerId
        ) {
            await saveCallHistoryForUser(
                call.calleeId,
                baseData
            );
        }
    } catch (error) {
        console.error(
            "SAVE CALL HISTORY ERROR:",
            error
        );
    }
}


async function saveCallHistoryForBoth(
    status,
    duration
) {
    if (
        !currentCallId ||
        !currentUser
    ) {
        return;
    }

    try {
        const snapshot =
            await get(
                ref(
                    db,
                    `calls/${currentCallId}`
                )
            );

        if (!snapshot.exists()) {
            return;
        }

        await saveCallHistoryFromCall(
            snapshot.val(),
            status,
            duration
        );

    } catch (error) {
        console.error(
            "SAVE HISTORY ERROR:",
            error
        );
    }
}


// ============================================================
// LISTEN FOR CALL HISTORY
// ============================================================

function listenForCallHistory() {
    if (!currentUser) return;

    const historyRef =
        ref(
            db,
            `callHistory/${currentUser.uid}`
        );

    if (historyListener) {
        historyListener();
    }

    historyListener =
        onValue(
            historyRef,
            snapshot => {
                const history = [];

                snapshot.forEach(child => {
                    const item =
                        child.val();

                    if (item) {
                        history.push({
                            id: child.key,
                            ...item
                        });
                    }
                });

                history.sort(
                    (a, b) =>
                        Number(
                            b.timestamp || 0
                        ) -
                        Number(
                            a.timestamp || 0
                        )
                );

                renderCallHistory(history);
            },
            error => {
                console.error(
                    "CALL HISTORY ERROR:",
                    error
                );
            }
        );
}


// ============================================================
// RENDER CALL HISTORY
// ============================================================

function renderCallHistory(history) {
    const element =
        $("callHistory");

    if (!element) return;

    element.innerHTML = "";

    if (!history.length) {
        element.innerHTML =
            "<p>No call history yet.</p>";
        return;
    }

    history.forEach(item => {
        const isCaller =
            item.callerId ===
            currentUser?.uid;

        const personName =
            isCaller
                ? item.calleeName
                : item.callerName;

        const type =
            isCaller
                ? "Outgoing"
                : "Incoming";

        const duration =
            formatDuration(
                item.duration
            );

        const row =
            document.createElement("div");

        row.className =
            "history-item";

        row.innerHTML = `
            <div class="history-avatar">
                ${avatarLetter(personName)}
            </div>

            <div class="history-info">
                <div class="history-name">
                    ${escapeHTML(personName || "User")}
                </div>

                <div class="history-status">
                    ${escapeHTML(type)} -
                    ${escapeHTML(item.status || "ended")}
                </div>

                <div class="history-time">
                    ${escapeHTML(formatTime(item.timestamp))}
                    ${duration !== "00:00" ? ` • ${escapeHTML(duration)}` : ""}
                </div>
            </div>
        `;

        element.appendChild(row);
    });
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
        "default" &&
        !notificationPermissionAsked
    ) {
        notificationPermissionAsked = true;

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


// ============================================================
// BUTTON EVENTS
// ============================================================

function setupEvents() {
    const loginForm =
        $("loginForm");

    const registerForm =
        $("registerForm");

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            loginUser
        );
    }

    if (registerForm) {
        registerForm.addEventListener(
            "submit",
            registerUser
        );
    }

    const logoutBtn =
        $("logoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener(
            "click",
            logoutUser
        );
    }

    const showRegisterBtn =
        $("showRegisterBtn");

    if (showRegisterBtn) {
        showRegisterBtn.addEventListener(
            "click",
            () => {
                const loginFormElement =
                    $("loginForm");

                const registerFormElement =
                    $("registerForm");

                if (loginFormElement) {
                    loginFormElement.style.display =
                        "none";
                }

                if (registerFormElement) {
                    registerFormElement.style.display =
                        "";
                }

                showAuthMessage("");
            }
        );
    }

    const showLoginBtn =
        $("showLoginBtn");

    if (showLoginBtn) {
        showLoginBtn.addEventListener(
            "click",
            () => {
                const loginFormElement =
                    $("loginForm");

                const registerFormElement =
                    $("registerForm");

                if (loginFormElement) {
                    loginFormElement.style.display =
                        "";
                }

                if (registerFormElement) {
                    registerFormElement.style.display =
                        "none";
                }

                showAuthMessage("");
            }
        );
    }

    const acceptBtn =
        $("acceptCallBtn");

    if (acceptBtn) {
        acceptBtn.addEventListener(
            "click",
            acceptCall
        );
    }

    const rejectBtn =
        $("rejectCallBtn");

    if (rejectBtn) {
        rejectBtn.addEventListener(
            "click",
            rejectCall
        );
    }

    const cancelBtn =
        $("cancelCallBtn");

    if (cancelBtn) {
        cancelBtn.addEventListener(
            "click",
            cancelOutgoingCall
        );
    }

    const endBtn =
        $("endCallBtn");

    if (endBtn) {
        endBtn.addEventListener(
            "click",
            () => endCall("ended")
        );
    }

    const muteBtn =
        $("muteBtn");

    if (muteBtn) {
        muteBtn.addEventListener(
            "click",
            toggleMute
        );
    }

    const speakerBtn =
        $("speakerBtn");

    if (speakerBtn) {
        speakerBtn.addEventListener(
            "click",
            toggleSpeaker
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

            await cleanupEverything();

            showScreen("auth");

            return;
        }

        currentUser = user;

        console.log(
            "AUTHENTICATED USER:",
            user.uid
        );

        console.log(
            "AUTH EMAIL:",
            user.email
        );

        try {
            await loadMyProfile();

            console.log(
                "PROFILE LOADED:",
                currentProfile
            );

            await setupPresence();

            console.log(
                "PRESENCE SETUP COMPLETE"
            );

            showScreen("main");

            updateMyUI();

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
                `Account error: ${
                    error?.message ||
                    "Unknown error"
                }`
            );
        }
    }
);


// ============================================================
// START APP
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {
        setupEvents();

        showScreen("auth");

        console.log(
            "VOICE CHAT APP STARTED"
        );
    }
);
