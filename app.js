// ============================================================
// VOICE CHAT APP - SECURE VERSION
// Firebase Authentication + Realtime Database + WebRTC
// ============================================================

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
// GLOBAL STATE
// ============================================================

let currentUser = null;
let currentProfile = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCallId = null;
let currentCall = null;
let currentOtherUser = null;

let incomingCall = null;

let usersUnsubscribe = null;
let incomingCallsUnsubscribe = null;
let historyUnsubscribe = null;
let callUnsubscribe = null;

let callerCandidatesUnsubscribe = null;
let calleeCandidatesUnsubscribe = null;

let pendingCandidates = [];

let callTimerInterval = null;
let callStartTime = null;

let isMuted = false;
let isSpeakerOn = true;


// ============================================================
// WEBRTC
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
// HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}


function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function avatarLetter(name) {
    const value = String(name || "U").trim();

    return escapeHTML(
        value.charAt(0).toUpperCase() || "U"
    );
}


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
    const remaining = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
        remaining
    ).padStart(2, "0")}`;
}


function showNotification(message) {
    console.log("APP:", message);

    const notification = $("notification");

    if (!notification) {
        return;
    }

    notification.textContent = message;
    notification.classList.add("show");

    clearTimeout(notification._timer);

    notification._timer = setTimeout(() => {
        notification.classList.remove("show");
    }, 4000);
}


function showAuthMessage(message, error = false) {
    const element = $("authMessage");

    if (!element) return;

    element.textContent = message;
    element.style.color = error ? "red" : "";
}


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
// REGISTER
// ============================================================

async function registerUser(event) {
    event.preventDefault();

    const name = $("registerName")?.value.trim();
    const email = $("registerEmail")?.value.trim();
    const password = $("registerPassword")?.value;
    const confirmPassword =
        $("registerConfirmPassword")?.value;

    if (!name) {
        showAuthMessage(
            "Please enter your name.",
            true
        );
        return;
    }

    if (!email) {
        showAuthMessage(
            "Please enter your email.",
            true
        );
        return;
    }

    if (!password || password.length < 6) {
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
        button.textContent = "Creating...";
    }

    try {
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

        const profile = {
            uid: credential.user.uid,
            name,
            email,
            online: true,
            createdAt: Date.now(),
            lastSeen: Date.now()
        };

        await set(
            ref(
                db,
                `users/${credential.user.uid}`
            ),
            profile
        );

        currentUser = credential.user;
        currentProfile = profile;

        showAuthMessage(
            "Account created successfully."
        );

    } catch (error) {
        console.error(
            "REGISTER ERROR:",
            error
        );

        showAuthMessage(
            error.message ||
                "Could not create account.",
            true
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                "Create Account";
        }
    }
}


// ============================================================
// LOGIN
// ============================================================

async function loginUser(event) {
    event.preventDefault();

    const email =
        $("loginEmail")?.value.trim();

    const password =
        $("loginPassword")?.value;

    if (!email || !password) {
        showAuthMessage(
            "Enter your email and password.",
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
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        showAuthMessage(
            "Login successful."
        );

    } catch (error) {
        console.error(
            "LOGIN ERROR:",
            error
        );

        console.error(
            "ERROR CODE:",
            error.code
        );

        showAuthMessage(
            error.message ||
                "Could not log in.",
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
        console.error(
            "LOGOUT ERROR:",
            error
        );

        showNotification(
            "Could not log out."
        );
    }
}


// ============================================================
// LOAD PROFILE
// ============================================================

async function loadMyProfile() {
    if (!currentUser) {
        throw new Error(
            "No authenticated user."
        );
    }

    const profileRef =
        ref(
            db,
            `users/${currentUser.uid}`
        );

    const snapshot =
        await get(profileRef);

    if (snapshot.exists()) {
        currentProfile =
            snapshot.val();

        return;
    }

    currentProfile = {
        uid: currentUser.uid,
        name:
            currentUser.displayName ||
            "User",
        email:
            currentUser.email ||
            "",
        online: true,
        createdAt: Date.now(),
        lastSeen: Date.now()
    };

    await set(
        profileRef,
        currentProfile
    );
}


// ============================================================
// PRESENCE
// ============================================================

async function setupPresence() {
    if (!currentUser) return;

    const userRef =
        ref(
            db,
            `users/${currentUser.uid}`
        );

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
// UPDATE UI
// ============================================================

function updateMyUI() {
    if (!currentProfile) return;

    const welcomeText =
        $("welcomeText");

    const myAvatar =
        $("myAvatar");

    if (welcomeText) {
        welcomeText.textContent =
            `Welcome, ${currentProfile.name}`;
    }

    if (myAvatar) {
        myAvatar.textContent =
            avatarLetter(
                currentProfile.name
            );
    }
}


// ============================================================
// USERS
// ============================================================

function listenForUsers() {
    if (usersUnsubscribe) {
        usersUnsubscribe();
    }

    const usersRef =
        ref(db, "users");

    usersUnsubscribe =
        onValue(
            usersRef,
            snapshot => {
                const users = [];

                snapshot.forEach(child => {
                    const user =
                        child.val();

                    if (
                        user &&
                        user.uid &&
                        user.uid !==
                            currentUser?.uid
                    ) {
                        users.push(user);
                    }
                });

                renderUsers(users);
            },
            error => {
                console.error(
                    "USERS ERROR:",
                    error
                );

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
    const list =
        $("usersList");

    if (!list) return;

    list.innerHTML = "";

    if (!users.length) {
        list.innerHTML =
            "<p>No other users found.</p>";

        return;
    }

    users.forEach(user => {
        const item =
            document.createElement("div");

        item.className =
            "user-item";

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
                    ${user.online ? "Online" : "Offline"}
                </div>
            </div>

            <button class="call-user-btn">
                Call
            </button>
        `;

        item
            .querySelector(".call-user-btn")
            ?.addEventListener(
                "click",
                () => startCall(user)
            );

        list.appendChild(item);
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
        async event => {
            if (!event.candidate) return;

            if (!currentCallId) return;

            const path =
                role === "caller"
                    ? `calls/${currentCallId}/callerCandidates`
                    : `calls/${currentCallId}/calleeCandidates`;

            try {
                const candidateRef =
                    push(ref(db, path));

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

    peerConnection.ontrack =
        event => {
            if (!remoteStream) {
                remoteStream =
                    new MediaStream();
            }

            for (const stream of event.streams) {
                for (
                    const track
                    of stream.getTracks()
                ) {
                    if (
                        !remoteStream
                            .getTracks()
                            .some(
                                existing =>
                                    existing.id ===
                                    track.id
                            )
                    ) {
                        remoteStream.addTrack(
                            track
                        );
                    }
                }
            }

            const audio =
                $("remoteAudio");

            if (audio) {
                audio.srcObject =
                    remoteStream;

                audio.play().catch(
                    error => {
                        console.log(
                            "Audio play waiting for interaction:",
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
                "CONNECTION STATE:",
                peerConnection.connectionState
            );

            if (
                peerConnection.connectionState ===
                "connected"
            ) {
                setCallStatus(
                    "Connected"
                );
            }

            if (
                peerConnection.connectionState ===
                "failed"
            ) {
                setCallStatus(
                    "Connection failed"
                );

                showNotification(
                    "Call connection failed."
                );
            }
        };

    return peerConnection;
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
            "Microphone access is not supported."
        );
    }

    try {
        return await navigator.mediaDevices.getUserMedia(
            {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            }
        );

    } catch (error) {
        console.error(
            "MICROPHONE ERROR:",
            error
        );

        if (
            error.name ===
            "NotAllowedError"
        ) {
            throw new Error(
                "Microphone permission was denied."
            );
        }

        if (
            error.name ===
            "NotFoundError"
        ) {
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

    if (!user?.uid) {
        showNotification(
            "Invalid user."
        );
        return;
    }

    if (currentCallId) {
        showNotification(
            "You are already in a call."
        );
        return;
    }

    currentOtherUser = user;

    try {
        localStream =
            await getMicrophone();

        createPeerConnection(
            "caller"
        );

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

        const callData = {
            callerId:
                currentUser.uid,

            callerName:
                currentProfile?.name ||
                currentUser.displayName ||
                "User",

            callerEmail:
                currentUser.email || "",

            calleeId:
                user.uid,

            calleeName:
                user.name || "User",

            calleeEmail:
                user.email || "",

            status:
                "ringing",

            offer: {
                type: offer.type,
                sdp: offer.sdp
            },

            createdAt:
                serverTimestamp()
        };

        await set(
            callRef,
            callData
        );

        // Secure incoming-call notification
        await set(
            ref(
                db,
                `incomingCalls/${user.uid}/${currentCallId}`
            ),
            {
                callerId:
                    currentUser.uid,

                callerName:
                    currentProfile?.name ||
                    "User",

                callerEmail:
                    currentUser.email ||
                    "",

                calleeId:
                    user.uid,

                status:
                    "ringing",

                createdAt:
                    serverTimestamp()
            }
        );

        showOutgoingCall(user);

        listenForCallUpdates();

        listenForCalleeCandidates();

        setOutgoingStatus(
            "Ringing..."
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
                error.message ||
                "Unknown error"
            }`
        );

        await cleanupCallAfterFailure();
    }
}


// ============================================================
// LISTEN FOR CALL UPDATES
// ============================================================

function listenForCallUpdates() {
    if (!currentCallId) return;

    if (callUnsubscribe) {
        callUnsubscribe();
    }

    const callRef =
        ref(
            db,
            `calls/${currentCallId}`
        );

    callUnsubscribe =
        onValue(
            callRef,
            async snapshot => {
                const call =
                    snapshot.val();

                if (!call) return;

                currentCall = call;

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

                        await flushPendingCandidates();

                        showActiveCall();

                        console.log(
                            "ANSWER RECEIVED"
                        );

                    } catch (error) {
                        console.error(
                            "ANSWER ERROR:",
                            error
                        );
                    }
                }

                if (
                    call.status ===
                    "accepted"
                ) {
                    showActiveCall();
                }

                if (
                    call.status ===
                    "rejected"
                ) {
                    showNotification(
                        "Call rejected."
                    );

                    await finishCall(
                        "rejected"
                    );
                }

                if (
                    call.status ===
                    "cancelled"
                ) {
                    showNotification(
                        "Call cancelled."
                    );

                    await finishCall(
                        "cancelled"
                    );
                }

                if (
                    call.status ===
                    "ended"
                ) {
                    await finishCall(
                        "ended"
                    );
                }
            },
            error => {
                console.error(
                    "CALL LISTENER ERROR:",
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

    if (calleeCandidatesUnsubscribe) {
        calleeCandidatesUnsubscribe();
    }

    calleeCandidatesUnsubscribe =
        onChildAdded(
            candidatesRef,
            snapshot => {
                addRemoteCandidate(
                    snapshot.val()
                );
            }
        );
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

    if (callerCandidatesUnsubscribe) {
        callerCandidatesUnsubscribe();
    }

    callerCandidatesUnsubscribe =
        onChildAdded(
            candidatesRef,
            snapshot => {
                addRemoteCandidate(
                    snapshot.val()
                );
            }
        );
}


// ============================================================
// REMOTE ICE
// ============================================================

async function addRemoteCandidate(
    candidate
) {
    if (!candidate) return;

    if (
        !peerConnection ||
        !peerConnection.remoteDescription
    ) {
        pendingCandidates.push(
            candidate
        );

        return;
    }

    try {
        await peerConnection.addIceCandidate(
            new RTCIceCandidate(candidate)
        );

    } catch (error) {
        console.error(
            "ICE ERROR:",
            error
        );
    }
}


async function flushPendingCandidates() {
    if (
        !peerConnection ||
        !peerConnection.remoteDescription
    ) {
        return;
    }

    while (
        pendingCandidates.length
    ) {
        const candidate =
            pendingCandidates.shift();

        try {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(
                    candidate
                )
            );

        } catch (error) {
            console.error(
                "QUEUED ICE ERROR:",
                error
            );
        }
    }
}


// ============================================================
// INCOMING CALL LISTENER
// ============================================================

function listenForIncomingCalls() {
    if (!currentUser) return;

    if (incomingCallsUnsubscribe) {
        incomingCallsUnsubscribe();
    }

    const incomingRef =
        ref(
            db,
            `incomingCalls/${currentUser.uid}`
        );

    incomingCallsUnsubscribe =
        onChildAdded(
            incomingRef,
            async snapshot => {
                const call =
                    snapshot.val();

                if (!call) return;

                if (
                    call.status !==
                    "ringing"
                ) {
                    return;
                }

                if (currentCallId) {
                    return;
                }

                currentCallId =
                    snapshot.key;

                incomingCall =
                    call;

                currentOtherUser = {
                    uid:
                        call.callerId,

                    name:
                        call.callerName,

                    email:
                        call.callerEmail
                };

                showIncomingCall(
                    call
                );

                playRingtone();
            },
            error => {
                console.error(
                    "INCOMING CALL ERROR:",
                    error
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
        !currentCallId ||
        !incomingCall
    ) {
        return;
    }

    stopRingtone();

    const call =
        incomingCall;

    try {
        hideIncomingCall();

        localStream =
            await getMicrophone();

        createPeerConnection(
            "callee"
        );

        localStream
            .getTracks()
            .forEach(track => {
                peerConnection.addTrack(
                    track,
                    localStream
                );
            });

        const callRef =
            ref(
                db,
                `calls/${currentCallId}`
            );

        const callSnapshot =
            await get(callRef);

        if (!callSnapshot.exists()) {
            throw new Error(
                "This call no longer exists."
            );
        }

        const callData =
            callSnapshot.val();

        currentCall =
            callData;

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                callData.offer
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
            callRef,
            {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },

                status:
                    "accepted",

                acceptedAt:
                    serverTimestamp()
            }
        );

        await update(
            ref(
                db,
                `incomingCalls/${currentUser.uid}/${currentCallId}`
            ),
            {
                status:
                    "accepted"
            }
        );

        showActiveCall();

        setCallStatus(
            "Connected"
        );

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
                error.message ||
                "Unknown error"
            }`
        );

        await finishCall(
            "failed"
        );
    }
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
                status:
                    "rejected",

                endedAt:
                    serverTimestamp()
            }
        );

        await update(
            ref(
                db,
                `incomingCalls/${currentUser.uid}/${currentCallId}`
            ),
            {
                status:
                    "rejected"
            }
        );

    } catch (error) {
        console.error(
            "REJECT ERROR:",
            error
        );
    }

    hideIncomingCall();

    currentCallId = null;
    currentCall = null;
    currentOtherUser = null;
    incomingCall = null;
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
                status:
                    "cancelled",

                endedAt:
                    serverTimestamp()
            }
        );

        if (currentOtherUser) {
            await update(
                ref(
                    db,
                    `incomingCalls/${currentOtherUser.uid}/${currentCallId}`
                ),
                {
                    status:
                        "cancelled"
                }
            );
        }

    } catch (error) {
        console.error(
            "CANCEL ERROR:",
            error
        );
    }

    await finishCall(
        "cancelled"
    );
}


// ============================================================
// END CALL BUTTON
// ============================================================

async function endCurrentCall() {
    await finishCall(
        "ended"
    );
}


// ============================================================
// FINISH CALL
// ============================================================

async function finishCall(
    status
) {
    const callId =
        currentCallId;

    const call =
        currentCall;

    const duration =
        callStartTime
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
            call
        ) {
            const callRef =
                ref(
                    db,
                    `calls/${callId}`
                );

            await update(
                callRef,
                {
                    status,
                    duration,
                    endedAt:
                        serverTimestamp()
                }
            );

            if (
                currentUser &&
                currentOtherUser
            ) {
                await saveCallHistory(
                    call,
                    status,
                    duration
                );
            }

            if (
                currentOtherUser?.uid
            ) {
                await update(
                    ref(
                        db,
                        `incomingCalls/${currentOtherUser.uid}/${callId}`
                    ),
                    {
                        status
                    }
                ).catch(
                    () => {}
                );
            }

            if (
                currentUser?.uid
            ) {
                await update(
                    ref(
                        db,
                        `incomingCalls/${currentUser.uid}/${callId}`
                    ),
                    {
                        status
                    }
                ).catch(
                    () => {}
                );
            }
        }

    } catch (error) {
        console.error(
            "FINISH CALL ERROR:",
            error
        );
    }

    cleanupWebRTC();

    hideAllCallOverlays();

    currentCallId = null;
    currentCall = null;
    currentOtherUser = null;
    incomingCall = null;
}


// ============================================================
// FAILURE CLEANUP
// ============================================================

async function cleanupCallAfterFailure() {
    try {
        if (
            currentCallId &&
            currentUser
        ) {
            await update(
                ref(
                    db,
                    `calls/${currentCallId}`
                ),
                {
                    status:
                        "failed"
                }
            ).catch(
                () => {}
            );
        }
    } catch (error) {
        console.error(
            error
        );
    }

    cleanupWebRTC();

    hideAllCallOverlays();

    currentCallId = null;
    currentCall = null;
    currentOtherUser = null;
    incomingCall = null;
}


// ============================================================
// CLEAN WEBRTC
// ============================================================

function cleanupWebRTC() {
    pendingCandidates = [];

    if (
        callerCandidatesUnsubscribe
    ) {
        callerCandidatesUnsubscribe();
        callerCandidatesUnsubscribe =
            null;
    }

    if (
        calleeCandidatesUnsubscribe
    ) {
        calleeCandidatesUnsubscribe();
        calleeCandidatesUnsubscribe =
            null;
    }

    if (callUnsubscribe) {
        callUnsubscribe();
        callUnsubscribe = null;
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
        peerConnection.close();
        peerConnection = null;
    }

    const audio =
        $("remoteAudio");

    if (audio) {
        audio.srcObject = null;
    }

    isMuted = false;
    isSpeakerOn = true;
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


function hideOutgoingCall() {
    const overlay =
        $("outgoingCallOverlay");

    if (overlay) {
        overlay.style.display =
            "none";
    }
}


function showActiveCall() {
    hideIncomingCall();
    hideOutgoingCall();

    const overlay =
        $("callOverlay");

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

    if (overlay) {
        overlay.style.display = "";
    }

    setCallStatus(
        "Connected"
    );

    startCallTimer();
}


function hideActiveCall() {
    const overlay =
        $("callOverlay");

    if (overlay) {
        overlay.style.display =
            "none";
    }
}


function hideIncomingCall() {
    const overlay =
        $("incomingCallOverlay");

    if (overlay) {
        overlay.style.display =
            "none";
    }
}


function hideAllCallOverlays() {
    hideIncomingCall();
    hideOutgoingCall();
    hideActiveCall();
}


function setCallStatus(status) {
    const element =
        $("callStatus");

    if (element) {
        element.textContent =
            status;
    }
}


function setOutgoingStatus(status) {
    const element =
        $("outgoingCallStatus");

    if (element) {
        element.textContent =
            status;
    }
}


// ============================================================
// TIMER
// ============================================================

function startCallTimer() {
    if (callTimerInterval) {
        return;
    }

    callStartTime =
        Date.now();

    const timer =
        $("callTimer");

    if (timer) {
        timer.textContent =
            "00:00";
    }

    callTimerInterval =
        setInterval(() => {
            if (!callStartTime) {
                return;
            }

            const seconds =
                Math.floor(
                    (Date.now() -
                        callStartTime) /
                        1000
                );

            if (timer) {
                timer.textContent =
                    formatDuration(
                        seconds
                    );
            }
        }, 1000);
}


function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(
            callTimerInterval
        );

        callTimerInterval =
            null;
    }

    callStartTime = null;
}


// ============================================================
// MUTE
// ============================================================

function toggleMute() {
    if (!localStream) return;

    const tracks =
        localStream.getAudioTracks();

    if (!tracks.length) return;

    isMuted = !isMuted;

    tracks.forEach(track => {
        track.enabled =
            !isMuted;
    });

    const button =
        $("muteBtn");

    if (button) {
        button.textContent =
            isMuted
                ? "Unmute"
                : "Mute";
    }
}


// ============================================================
// SPEAKER
// ============================================================

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
            console.log(
                "Ringtone autoplay blocked:",
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

async function saveCallHistory(
    call,
    status,
    duration
) {
    if (!call) return;

    const historyData = {
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
        timestamp:
            Date.now()
    };

    try {
        if (call.callerId) {
            await set(
                push(
                    ref(
                        db,
                        `callHistory/${call.callerId}`
                    )
                ),
                historyData
            );
        }

        if (
            call.calleeId &&
            call.calleeId !==
                call.callerId
        ) {
            await set(
                push(
                    ref(
                        db,
                        `callHistory/${call.calleeId}`
                    )
                ),
                historyData
            );
        }

    } catch (error) {
        console.error(
            "HISTORY ERROR:",
            error
        );
    }
}


// ============================================================
// HISTORY LISTENER
// ============================================================

function listenForCallHistory() {
    if (!currentUser) return;

    if (historyUnsubscribe) {
        historyUnsubscribe();
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
                const history = [];

                snapshot.forEach(child => {
                    const data =
                        child.val();

                    if (data) {
                        history.push(
                            {
                                id:
                                    child.key,
                                ...data
                            }
                        );
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

                renderCallHistory(
                    history
                );
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

        const person =
            isCaller
                ? item.calleeName
                : item.callerName;

        const row =
            document.createElement("div");

        row.className =
            "history-item";

        row.innerHTML = `
            <div class="history-avatar">
                ${avatarLetter(person)}
            </div>

            <div class="history-info">
                <div class="history-name">
                    ${escapeHTML(person || "User")}
                </div>

                <div class="history-status">
                    ${escapeHTML(item.status || "ended")}
                </div>

                <div class="history-time">
                    ${escapeHTML(formatTime(item.timestamp))}
                    •
                    ${escapeHTML(
                        formatDuration(item.duration)
                    )}
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
        "default"
    ) {
        try {
            await Notification.requestPermission();
        } catch (error) {
            console.log(
                "Notification permission:",
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
        console.log(
            "Notification error:",
            error
        );
    }
}


// ============================================================
// CLEANUP EVERYTHING
// ============================================================

async function cleanupEverything() {
    stopRingtone();
    stopCallTimer();

    cleanupWebRTC();

    hideAllCallOverlays();

    if (usersUnsubscribe) {
        usersUnsubscribe();
        usersUnsubscribe = null;
    }

    if (incomingCallsUnsubscribe) {
        incomingCallsUnsubscribe();
        incomingCallsUnsubscribe =
            null;
    }

    if (historyUnsubscribe) {
        historyUnsubscribe();
        historyUnsubscribe = null;
    }

    currentCallId = null;
    currentCall = null;
    currentOtherUser = null;
    incomingCall = null;
}


// ============================================================
// BUTTON EVENTS
// ============================================================

function setupEvents() {

    $("loginForm")?.addEventListener(
        "submit",
        loginUser
    );

    $("registerForm")?.addEventListener(
        "submit",
        registerUser
    );

    $("logoutBtn")?.addEventListener(
        "click",
        logoutUser
    );

    $("acceptCallBtn")?.addEventListener(
        "click",
        acceptCall
    );

    $("rejectCallBtn")?.addEventListener(
        "click",
        rejectCall
    );

    $("cancelCallBtn")?.addEventListener(
        "click",
        cancelOutgoingCall
    );

    $("endCallBtn")?.addEventListener(
        "click",
        endCurrentCall
    );

    $("muteBtn")?.addEventListener(
        "click",
        toggleMute
    );

    $("speakerBtn")?.addEventListener(
        "click",
        toggleSpeaker
    );

    $("showRegisterBtn")?.addEventListener(
        "click",
        () => {
            if ($("loginForm")) {
                $("loginForm").style.display =
                    "none";
            }

            if ($("registerForm")) {
                $("registerForm").style.display =
                    "";
            }

            showAuthMessage("");
        }
    );

    $("showLoginBtn")?.addEventListener(
        "click",
        () => {
            if ($("loginForm")) {
                $("loginForm").style.display =
                    "";
            }

            if ($("registerForm")) {
                $("registerForm").style.display =
                    "none";
            }

            showAuthMessage("");
        }
    );
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
// START
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
