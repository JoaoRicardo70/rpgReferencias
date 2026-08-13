import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

// ⚠️ COLE AS SUAS CHAVES REAIS AQUI DENTRO:
const firebaseConfig = {
  apiKey: "AIzaSyCIe8afbrSIioGN0DA7F5ZCGcmCbNNqRos",
  authDomain: "rpg-referencias.firebaseapp.com",
  databaseURL: "https://rpg-referencias-default-rtdb.firebaseio.com",
  projectId: "rpg-referencias",
  storageBucket: "rpg-referencias.firebasestorage.app",
  messagingSenderId: "966175643115",
  appId: "1:966175643115:web:da9165e220551d6aa6b5ae",
  measurementId: "G-XNM1YDV83P"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta as ferramentas para o resto do site usar
export const db = getDatabase(app);
// 🔥 ADICIONAMOS ESTA LINHA: Assim o MestreSubComponents acha a palavra "database" sem chorar!
export const database = db; 

export const storage = getStorage(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);