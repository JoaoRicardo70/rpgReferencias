import { ref, set, get, push, remove, onValue, onChildAdded, limitToLast, query, onDisconnect } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase-config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import useStore, { sanitizarNome } from '../stores/useStore';

let _modoPlasmic = false;
export function setModoPlasmic(ativo) { _modoPlasmic = ativo; }
function isInPlasmicCanvas() { return _modoPlasmic; }

// ==========================================
// 🔥 SISTEMA DE PRESENÇA (ONLINE/OFFLINE) 🔥
// ==========================================
export function iniciarSistemaDePresenca(mesaId, meuNome) {
    if (!db || !mesaId || !meuNome) return () => {};
    const nomeSanitizado = sanitizarNome(meuNome);
    const myConnectionsRef = ref(db, `mesas/${mesaId}/presenca/${nomeSanitizado}`);
    const connectedRef = ref(db, '.info/connected');

    const unsub = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            onDisconnect(myConnectionsRef).remove().then(() => { set(myConnectionsRef, true); });
        }
    });
    return unsub;
}
export function iniciarListenerPresenca(mesaId, callback) {
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/presenca`), (snapshot) => { callback(snapshot.val() || {}); });
}
export function removerPresencaImediata(mesaId, meuNome) {
    if (!db || !mesaId || !meuNome) return;
    remove(ref(db, `mesas/${mesaId}/presenca/${sanitizarNome(meuNome)}`)).catch(()=>{});
}

// ==========================================
// 🔥 MÁGICA DA AUTENTICAÇÃO 🔥
// ==========================================
export function registrarUsuario(nickname, senha) {
    const fakeEmail = `${sanitizarNome(nickname)}@multiverso.rpg`;
    return createUserWithEmailAndPassword(auth, fakeEmail, senha);
}
export function entrarUsuario(nickname, senha) {
    const fakeEmail = `${sanitizarNome(nickname)}@multiverso.rpg`;
    return signInWithEmailAndPassword(auth, fakeEmail, senha);
}
export function sairConta() { return signOut(auth); }
export function monitorarAuth(callback) {
    return onAuthStateChanged(auth, (user) => {
        if (user && user.email) {
            const nick = user.email.split('@')[0];
            
            // 🔥 A MÁGICA: Injeta a identidade diretamente no Cérebro do Jogo
            useStore.getState().setMeuNome(nick); 
            localStorage.setItem('rpgNome', nick); // Garante a retrocompatibilidade com a Web
            
            callback(nick);
        }
        else {
            useStore.getState().setMeuNome('');
            localStorage.removeItem('rpgNome');
            callback(null);
        }
    });
}

// ==========================================
// 🔥 SISTEMA DE MESAS E MESTRES 🔥
// ==========================================
export async function registrarNovaMesa(id, nomeMestre, senha = '') {
    if (!db) return;
    const mesaRef = ref(db, `index_mesas/${id}`);
    const nickSanitizado = sanitizarNome(nomeMestre);
    await set(mesaRef, { 
        id: id, mestre: nomeMestre, senha: senha, criadaEm: Date.now(), ativa: true, 
        mestres: { [nickSanitizado]: true } 
    });
}

export async function verificarMesaExistente(id, senhaTentativa = '') {
    if (!db || !id) return { existe: false };
    const mesaRef = ref(db, `index_mesas/${id}`);
    const snap = await get(mesaRef);
    if (!snap.exists()) return { existe: false };
    const dados = snap.val();
    
    // 🔥 CORREÇÃO DE RETROCOMPATIBILIDADE (Mesas Antigas) 🔥
    const mestresDaMesa = dados.mestres || {};
    if (dados.mestre) {
        mestresDaMesa[sanitizarNome(dados.mestre)] = true;
    }

    if (dados.senha && String(dados.senha) !== String(senhaTentativa)) {
        return { existe: true, senhaCorreta: false, mestres: mestresDaMesa };
    }
    return { existe: true, senhaCorreta: true, mestres: mestresDaMesa };
}

export function iniciarListenerMestres(mesaId, callback) {
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `index_mesas/${mesaId}`), (snapshot) => {
        const dados = snapshot.val() || {};
        
        // 🔥 CORREÇÃO DE RETROCOMPATIBILIDADE 🔥
        const mestresDict = dados.mestres || {};
        if (dados.mestre) {
            mestresDict[sanitizarNome(dados.mestre)] = true;
        }
        
        callback(dados.mestre || '', mestresDict);
    });
}

export async function promoverAMestreFirebase(mesaId, nickAcesso) {
    if (!db || !mesaId || !nickAcesso) return;
    const nickSanitizado = sanitizarNome(nickAcesso);
    await set(ref(db, `index_mesas/${mesaId}/mestres/${nickSanitizado}`), true);
}

// ==========================================
// 🔥 SINCRONIZAÇÃO DE FICHAS 🔥
// ==========================================
let debounceTimer = null;
export function salvarFichaSilencioso() {
    if (isInPlasmicCanvas()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { salvarFirebaseImediato().catch(() => {}); }, 500);
}
export function salvarFirebaseImediato() {
    if (isInPlasmicCanvas()) return Promise.resolve();
    const { minhaFicha, meuNome, mesaId } = useStore.getState();
    const nomeSanitizado = sanitizarNome(meuNome);
    if (!nomeSanitizado || !mesaId) return Promise.resolve();
    
    const fichaParaSalvar = JSON.parse(JSON.stringify(minhaFicha));

    // 🔥 TRAVA DE SEGURANÇA DOS DOMÍNIOS (Força a inclusão) 🔥
    if (minhaFicha.dominios && !fichaParaSalvar.dominios) {
        fichaParaSalvar.dominios = minhaFicha.dominios;
    }

    try {
        localStorage.setItem('rpgFicha_' + nomeSanitizado, JSON.stringify(fichaParaSalvar));
        localStorage.setItem('rpgNome', nomeSanitizado);
    } catch (err) {}
    
    if (!db) return Promise.resolve();
    return set(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}`), fichaParaSalvar).catch((err) => { throw err; });
}
export async function carregarFichaDoFirebase(nome) {
    if (isInPlasmicCanvas()) return null;
    const nomeSanitizado = sanitizarNome(nome);
    const { mesaId } = useStore.getState();
    if (!nomeSanitizado || !db || !mesaId) return null;
    try {
        const snapshot = await get(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}`));
        return snapshot.exists() ? snapshot.val() : null;
    } catch (err) { return null; }
}
export function iniciarListenerPersonagens(callback) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/personagens`), (snapshot) => { callback(snapshot.val() || {}); });
}

// ==========================================
// 🔥 OUTROS SISTEMAS DE MESA 🔥
// ==========================================
export function iniciarListenerFeed(callback) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    const feedRef = query(ref(db, `mesas/${mesaId}/feed_combate`), limitToLast(50));
    return onChildAdded(feedRef, (snapshot) => {
        const entry = snapshot.val();
        if (entry && callback) callback(entry);
    });
}
export function enviarParaFeed(d) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return;
    push(ref(db, `mesas/${mesaId}/feed_combate`), d).catch(() => {});
}
export async function deletarPersonagem(nome) {
    if (isInPlasmicCanvas()) return;
    const nomeSanitizado = sanitizarNome(nome);
    const { mesaId } = useStore.getState();
    if (!nomeSanitizado || !mesaId) return;
    try { localStorage.removeItem('rpgFicha_' + nomeSanitizado); } catch (err) {}
    if (!db) return;
    await remove(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}`));
}
export const apagarFicha = deletarPersonagem;

export function enviarParaJukebox(estado) {
    if (isInPlasmicCanvas()) return Promise.resolve();
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return Promise.resolve();
    return set(ref(db, `mesas/${mesaId}/jukebox`), estado).catch(() => {});
}
export function iniciarListenerJukebox(callback) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/jukebox`), (snapshot) => { callback(snapshot.val() || null); });
}
export async function uploadImagem(file, pasta = 'imagens') {
    if (isInPlasmicCanvas()) return '';
    const { mesaId } = useStore.getState();
    if (!storage || !mesaId) throw new Error("Storage não inicializado.");
    const extensao = file.name.split('.').pop();
    const nomeUnico = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${extensao}`;
    const caminhoRef = storageRef(storage, `mesas/${mesaId}/${pasta}/${nomeUnico}`);
    await uploadBytes(caminhoRef, file);
    return await getDownloadURL(caminhoRef);
}
export function iniciarListenerDummies(callback) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/dummies`), (snapshot) => { callback(snapshot.val() || {}); });
}
export function salvarDummie(id, dadosDummie) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return;
    set(ref(db, `mesas/${mesaId}/dummies/${id}`), dadosDummie).catch(() => {});
}
export function deletarDummie(id) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return;
    remove(ref(db, `mesas/${mesaId}/dummies/${id}`)).catch(() => {});
}
export function iniciarListenerCenario(callback) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/cenario`), (snapshot) => {
        const dados = snapshot.val() || { ativa: 'default', lista: { default: { nome: 'Cenário Inicial', img: '', escala: 1.5, unidade: 'm' } } };
        if (callback) callback(dados);
    });
}
export function salvarCenarioCompleto(dadosCenario) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return;
    set(ref(db, `mesas/${mesaId}/cenario`), dadosCenario).catch(() => {});
}
// 🔥 Divisor de Poder padrão da mesa: valor global que o Mestre define (fora de
// ficha.divisorPoder, que é por personagem) para dividir o Poder do Scouter de TODOS os
// jogadores da mesa de uma vez — mesmo esqueleto de iniciarListenerDummies/salvarDummie.
export function iniciarListenerDivisorPoderMesa(callback) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/divisorPoderPadrao`), (snapshot) => {
        const val = parseFloat(snapshot.val());
        if (callback) callback((!isNaN(val) && val > 0) ? val : 1);
    });
}
export function salvarDivisorPoderMesa(valor) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return;
    set(ref(db, `mesas/${mesaId}/divisorPoderPadrao`), valor).catch(() => {});
}
export function zerarIniciativaGlobal(nomesArray) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return;
    nomesArray.forEach(nome => {
        const nomeSanitizado = sanitizarNome(nome);
        set(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}/iniciativa`), 0).catch(() => {});
    });
}
export function iniciarListenerTemasCustom(callback) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/temas`), (snapshot) => { callback(snapshot.val() || {}); });
}
export function salvarTemaFirebase(id, dadosTema) {
    if (isInPlasmicCanvas()) return Promise.resolve();
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return Promise.resolve();
    return set(ref(db, `mesas/${mesaId}/temas/${id}`), dadosTema).catch((err) => { throw err; });
}
export function deletarTemaFirebase(id) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return;
    remove(ref(db, `mesas/${mesaId}/temas/${id}`)).catch(() => {});
}