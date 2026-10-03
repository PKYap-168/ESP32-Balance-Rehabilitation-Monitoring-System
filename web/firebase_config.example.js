// ==========================================
// FIREBASE IMPORTS
// ==========================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  onValue
} from
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";


// ==========================================
// FIREBASE CONFIGURATION
// ==========================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGE_SENDER_ID",
  appId: "YOUR_APP_ID"
};


// ==========================================
// INITIALIZE FIREBASE
// ==========================================

const app = initializeApp(firebaseConfig);

const database = getDatabase(app);


// ==========================================
// EXPORT DATABASE FUNCTIONS
// ==========================================

export {
  database,
  ref,
  set,
  onValue
};
