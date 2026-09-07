// firebase-messaging-sw.js

importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js"
);


// ======================================================
// FIREBASE CONFIG
// ======================================================

firebase.initializeApp({
  apiKey: "AIzaSyAVy5nFd6sjyoVSYnnqRfXJpu29FstxFZc"
  authDomain: "voice-chat01-63e85.firebaseapp.com",
  projectId: "voice-chat01-63e85",
  storageBucket: "voice-chat01-63e85.firebasestorage.app",
  messagingSenderId: "113293901393",
  appId: "1:113293901393:web:bfbca6f5da36368e274270"
});


// ======================================================
// FIREBASE MESSAGING
// ======================================================

const messaging = firebase.messaging();


// ======================================================
// BACKGROUND NOTIFICATION
// ======================================================

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Background message:",
    payload
  );

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title =
    notification.title ||
    data.title ||
    "Incoming call";

  const body =
    notification.body ||
    data.body ||
    "Someone is calling you.";


  const callId = data.callId || "";

  const notificationOptions = {
    body: body,

    icon: data.icon || "/icon-192.png",

    badge: data.badge || "/icon-192.png",

    tag: callId
      ? `incoming-call-${callId}`
      : "incoming-call",

    renotify: true,

    requireInteraction: true,

    data: {
      callId: callId,

      callerId: data.callerId || "",

      callerName: data.callerName || "",

      callerEmail: data.callerEmail || "",

      callType: data.callType || "audio"
    },

    actions: [
      {
        action: "accept",
        title: "Answer"
      },
      {
        action: "reject",
        title: "Decline"
      }
    ]
  };


  return self.registration.showNotification(
    title,
    notificationOptions
  );
});


// ======================================================
// NOTIFICATION CLICK
// ======================================================

self.addEventListener(
  "notificationclick",
  (event) => {

    const notification =
      event.notification;

    const data =
      notification.data || {};

    const action =
      event.action;


    notification.close();


    event.waitUntil(

      clients
        .matchAll({
          type: "window",
          includeUncontrolled: true
        })

        .then((clientList) => {

          // ----------------------------------------------
          // DECLINE
          // ----------------------------------------------

          if (action === "reject") {

            console.log(
              "Call rejected from notification."
            );

            return;
          }


          // ----------------------------------------------
          // ANSWER OR NORMAL CLICK
          // ----------------------------------------------

          for (const client of clientList) {

            if ("focus" in client) {

              client.focus();

              // Send call information to app.js
              client.postMessage({
                type: "INCOMING_CALL_NOTIFICATION",

                callId:
                  data.callId || "",

                callerId:
                  data.callerId || "",

                callerName:
                  data.callerName || "",

                callerEmail:
                  data.callerEmail || "",

                callType:
                  data.callType || "audio",

                action:
                  action || "open"
              });

              return;
            }
          }


          // ----------------------------------------------
          // OPEN WEBSITE IF NOT ALREADY OPEN
          // ----------------------------------------------

          if (clients.openWindow) {

            const url =
              data.callId
                ? `/?callId=${encodeURIComponent(data.callId)}`
                : "/";

            return clients.openWindow(url);
          }

        })
    );
  }
);


// ======================================================
// SERVICE WORKER INSTALL
// ======================================================

self.addEventListener(
  "install",
  () => {

    console.log(
      "Firebase Messaging Service Worker installed."
    );

    self.skipWaiting();
  }
);


// ======================================================
// SERVICE WORKER ACTIVATE
// ======================================================

self.addEventListener(
  "activate",
  (event) => {

    console.log(
      "Firebase Messaging Service Worker activated."
    );

    event.waitUntil(
      self.clients.claim()
    );
  }
);


// ======================================================
// MESSAGE FROM app.js
// ======================================================

self.addEventListener(
  "message",
  (event) => {

    console.log(
      "Message received by service worker:",
      event.data
    );

  }
);
