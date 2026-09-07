// firebase-messaging-sw.js

importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyAVy5nFd6sjyoVSYnnqRfXJpu29FstxFZc",
  authDomain: "voice-chat01-63e85.firebaseapp.com",
  databaseURL: "https://voice-chat01-63e85-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "voice-chat01-63e85",
  storageBucket: "voice-chat01-63e85.firebasestorage.app",
  messagingSenderId: "113293901393",
  appId: "1:113293901393:web:bfbca6f5da36368e274270"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Background message:",
    payload
  );

  const notificationTitle =
    payload.data?.title || "Incoming Call";

  const notificationOptions = {
    body: payload.data?.body || "Someone is calling you",
    icon: payload.data?.icon || "/icon.png",
    badge: payload.data?.badge || "/icon.png",
    data: payload.data || {},

    vibrate: [500, 200, 500, 200, 500],

    actions: [
      {
        action: "accept",
        title: "Accept"
      },
      {
        action: "decline",
        title: "Decline"
      }
    ]
  };

  return self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((clientList) => {

      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({
            type: "CALL_NOTIFICATION_ACTION",
            action: action,
            callId: data.callId || null
          });

          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(
          "/?callId=" + encodeURIComponent(data.callId || "")
        );
      }
    })
  );
});
