// ==========================================
// FIREBASE MESSAGING SERVICE WORKER
// ==========================================

importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js"
);


// ==========================================
// FIREBASE CONFIG
// ==========================================

firebase.initializeApp({
  apiKey: "AIzaSyAVy5nFd6sjyoVSYnnqRfXJpu29FstxFZc",
  authDomain: "voice-chat01-63e85.firebaseapp.com",
  projectId: "voice-chat01-63e85",
  storageBucket: "voice-chat01-63e85.firebasestorage.app",
  messagingSenderId: "113293901393",
  appId: "1:113293901393:web:bfbca6f5da36368e274270"
});


// ==========================================
// FIREBASE MESSAGING
// ==========================================

const messaging = firebase.messaging();


// ==========================================
// BACKGROUND INCOMING CALL
// ==========================================

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Background message:",
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


  // Prevent duplicate notification if necessary
  const notificationOptions = {
    body: body,

    icon:
      data.icon ||
      "/icon-192.png",

    badge:
      data.badge ||
      "/icon-192.png",

    tag:
      data.callId
        ? `call-${data.callId}`
        : "incoming-call",

    renotify: true,

    requireInteraction: true,

    data: {
      type:
        data.type ||
        "incoming_call",

      callId:
        data.callId || "",

      callerId:
        data.callerId || "",

      callerName:
        data.callerName ||
        "User"
    }
  };


  return self.registration.showNotification(
    title,
    notificationOptions
  );
});


// ==========================================
// NOTIFICATION CLICK
// ==========================================

self.addEventListener(
  "notificationclick",
  (event) => {

    event.notification.close();

    const data =
      event.notification.data || {};

    const callId =
      data.callId || "";

    event.waitUntil(

      clients
        .matchAll({
          type: "window",
          includeUncontrolled: true
        })

        .then((clientList) => {

          // If the website is already open,
          // bring it to the front.
          for (const client of clientList) {

            if ("focus" in client) {

              if (
                callId &&
                "postMessage" in client
              ) {
                client.postMessage({
                  type: "incoming_call",
                  callId: callId
                });
              }

              return client.focus();
            }
          }


          // If the website isn't open,
          // open it.
          if (clients.openWindow) {

            const url =
              callId
                ? `/?callId=${encodeURIComponent(callId)}`
                : "/";

            return clients.openWindow(url);
          }

        })

    );
  }
);


// ==========================================
// SERVICE WORKER INSTALL
// ==========================================

self.addEventListener(
  "install",
  () => {
    console.log(
      "Firebase Messaging Service Worker installed."
    );

    self.skipWaiting();
  }
);


// ==========================================
// SERVICE WORKER ACTIVATE
// ==========================================

self.addEventListener(
  "activate",
  (event) => {

    event.waitUntil(
      self.clients.claim()
    );

    console.log(
      "Firebase Messaging Service Worker activated."
    );
  }
);
