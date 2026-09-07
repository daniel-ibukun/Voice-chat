// ============================================================
// FIREBASE CLOUD MESSAGING SERVICE WORKER
// ============================================================

importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js"
);


// ============================================================
// FIREBASE CONFIG
// ============================================================

firebase.initializeApp({
  apiKey: "AIzaSyAVy5nFd6sjyoVSYnnqRfXJpu29FstxFZc",
  authDomain: "voice-chat01-63e85.firebaseapp.com",
  projectId: "voice-chat01-63e85",
  storageBucket: "voice-chat01-63e85.firebasestorage.app",
  messagingSenderId: "113293901393",
  appId: "1:113293901393:web:bfbca6f5da36368e274270"
});


// ============================================================
// FIREBASE MESSAGING
// ============================================================

const messaging = firebase.messaging();


// ============================================================
// BACKGROUND CALL NOTIFICATION
// ============================================================

messaging.onBackgroundMessage((payload) => {

  console.log(
    "BACKGROUND FCM MESSAGE:",
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

  self.registration.showNotification(
    title,
    {
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

      data: data
    }
  );
});


// ============================================================
// WHEN USER CLICKS THE NOTIFICATION
// ============================================================

self.addEventListener(
  "notificationclick",
  (event) => {

    console.log(
      "CALL NOTIFICATION CLICKED"
    );

    event.notification.close();

    event.waitUntil(

      clients.matchAll({
        type: "window",
        includeUncontrolled: true
      })

      .then((clientList) => {

        // If the website is already open,
        // bring it to the front.

        for (
          const client of clientList
        ) {

          if (
            "focus" in client
          ) {

            return client.focus();
          }
        }

        // Otherwise open the website.

        if (
          clients.openWindow
        ) {

          return clients.openWindow(
            "/"
          );
        }

      })

    );

  }
);
