// Firebase Cloud Bootstrap for IPTV Manager
// Drop this <script type="module" src="firebase_bootstrap.js"></script> near the end of <body>
// Requires no bundler; uses Firebase CDN modules.
//
// Provides:
//   window.CloudAuth  : { signup(email, pass), login(email, pass), logout(), onAuth(cb) }
//   window.CloudStore : { loadAll(), saveSettings(settings), saveClients(list), onClients(cb), migrateLocalToCloud(ls) }
//   window.CloudState : { uid, settings, clients }
//   window.debounceSaveAll() : debounced write of both settings + clients
//
// Firestore layout:
//   users/{uid} (settings)
//   users/{uid}/data/clients (list: [...])
//
// Security rules (set in Firebase console):
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{db}/documents {
//     match /users/{uid} {
//       allow read, write: if request.auth != null && request.auth.uid == uid;
//       match /data/{doc} {
//         allow read, write: if request.auth != null && request.auth.uid == uid;
//       }
//     }
//   }
// }
//
// (c) You — use at will.

// === Firebase SDK (CDN ESM) ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// === Your Firebase config ===
const firebaseConfig = {
  apiKey: "AIzaSyAGmLhAfYeZSuUQACpfEwm3kxxo0waWXNE",
  authDomain: "iptv-manager-71684.firebaseapp.com",
  projectId: "iptv-manager-71684",
  storageBucket: "iptv-manager-71684.firebasestorage.app",
  messagingSenderId: "135610126019",
  appId: "1:135610126019:web:590c90e00d1d19976adc76",
  measurementId: "G-8K905NM0WB"
};

// === Init ===
const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) { /* analytics requires https + real domain; ignore locally */ }
const auth = getAuth(app);
const db   = getFirestore(app);

// === Simple global state ===
const CloudState = {
  uid: null,
  settings: { credits: 500, cost: 12, price: 60, saleDefault: 300 },
  clients: []
};

function userDoc(uid){ return doc(db, "users", uid); }
function clientsDoc(uid){ return doc(db, "users", uid, "data", "clients"); }

// === Auth helpers ===
const CloudAuth = {
  async signup(email, password){
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // initialize defaults
    await setDoc(userDoc(cred.user.uid), CloudState.settings, { merge: true });
    return cred.user;
  },
  async login(email, password){
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },
  async logout(){ await signOut(auth); },
  onAuth(cb){
    return onAuthStateChanged(auth, async (user)=>{
      CloudState.uid = user ? user.uid : null;
      if(user){
        await CloudStore.loadAll();
      }
      cb(user);
    });
  }
};

// === Store helpers ===
const CloudStore = {
  async loadAll(){
    if(!CloudState.uid) return;
    // settings
    const u = await getDoc(userDoc(CloudState.uid));
    if(u.exists()){
      const d = u.data();
      CloudState.settings = {
        credits: typeof d.credits === 'number' ? d.credits : 500,
        cost: typeof d.cost === 'number' ? d.cost : 12,
        price: typeof d.price === 'number' ? d.price : 60,
        saleDefault: typeof d.saleDefault === 'number' ? d.saleDefault : 300,
      };
    }
    // clients (one-shot load)
    const c = await getDoc(clientsDoc(CloudState.uid));
    CloudState.clients = c.exists() && Array.isArray(c.data().list) ? c.data().list : [];
    return { ...CloudState };
  },
  onClients(cb){
    if(!CloudState.uid) return ()=>{};
    // realtime updates
    return onSnapshot(clientsDoc(CloudState.uid), (snap)=>{
      const d = snap.data();
      if(d && Array.isArray(d.list)){
        CloudState.clients = d.list;
        cb(CloudState.clients);
      }
    });
  },
  async saveSettings(settings){
    if(!CloudState.uid) throw new Error("Not authenticated");
    CloudState.settings = { ...CloudState.settings, ...settings };
    await setDoc(userDoc(CloudState.uid), CloudState.settings, { merge: true });
  },
  async saveClients(list){
    if(!CloudState.uid) throw new Error("Not authenticated");
    CloudState.clients = Array.isArray(list) ? list : [];
    await setDoc(clientsDoc(CloudState.uid), { list: CloudState.clients }, { merge: true });
  },
  async migrateLocalToCloud(ls){
    // ls: { clients, credits, cost, price, saleDefault }
    if(!CloudState.uid) throw new Error("Not authenticated");
    const settings = {
      credits: Number(ls?.credits ?? 500),
      cost: Number(ls?.cost ?? 12),
      price: Number(ls?.price ?? 60),
      saleDefault: Number(ls?.saleDefault ?? ls?.sale ?? 300)
    };
    const clients = Array.isArray(ls?.clients) ? ls.clients : [];
    await setDoc(userDoc(CloudState.uid), settings, { merge: true });
    await setDoc(clientsDoc(CloudState.uid), { list: clients }, { merge: true });
  }
};

// Debounced combined save (useful to call after multiple edits)
let __debounceTimer = null;
function debounceSaveAll(){
  clearTimeout(__debounceTimer);
  __debounceTimer = setTimeout(async ()=>{
    await CloudStore.saveSettings(CloudState.settings);
    await CloudStore.saveClients(CloudState.clients);
  }, 300);
}

// Expose to window
window.CloudAuth = CloudAuth;
window.CloudStore = CloudStore;
window.CloudState = CloudState;
window.debounceSaveAll = debounceSaveAll;

// === Optional small helpers to wire with existing UI ===
window.CloudWire = {
  // Call this once on page load to wire auth → then load your UI
  start({ onSignedIn, onSignedOut } = {}){
    CloudAuth.onAuth(async (user)=>{
      if(user){
        if(typeof onSignedIn === 'function') onSignedIn(user, { ...CloudState });
      } else {
        if(typeof onSignedOut === 'function') onSignedOut();
      }
    });
  }
};
