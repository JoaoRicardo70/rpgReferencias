import { ref, set, update, get, push, remove, onValue, onChildAdded, limitToLast, query, onDisconnect } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase-config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import useStore, { sanitizarNome } from '../stores/useStore';
import { calcularDiffFirebase, mesclarComRemoto } from '../core/utils.js';

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

// 🔥 Último estado da ficha confirmado no Firebase (o que este cliente sabe que
// está lá agora). Serve de baseline tanto para calcular o diff de saída (o que
// realmente mudou desde a última sincronização) quanto para o merge de entrada
// (mesclarComRemoto, no listener em tempo real abaixo). `null` = ainda não
// sincronizou nada nesta sessão/personagem.
let ultimoEstadoSincronizado = null;

// 🔥 Reseta a baseline de sincronização — precisa ser chamado sempre que o
// jogador troca de mesa ou de personagem, senão o diff/merge do personagem
// NOVO seria calculado contra o estado do personagem ANTERIOR. Também cancela
// um debounce pendente: sem isso, um save agendado para o personagem ANTIGO
// podia disparar depois da troca e gravar a ficha errada no personagem NOVO.
export function resetSincronizacaoFicha() {
    ultimoEstadoSincronizado = null;
    clearTimeout(debounceTimer);
    debounceTimer = null;
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

    // 🔥 ATUALIZAÇÃO PARCIAL (não mais `set()` da ficha inteira): manda pro
    // Firebase só os campos que mudaram desde a última sincronização. Isso
    // evita o "esmagamento de dados" — antes, salvar a ficha inteira a cada
    // debounce apagava qualquer mudança feita por outra aba/dispositivo (ou
    // pelo Mestre, via PainelMestreSandbox) que este cliente ainda não tinha
    // recebido de volta.
    const alteracoes = calcularDiffFirebase(ultimoEstadoSincronizado, fichaParaSalvar);
    if (Object.keys(alteracoes).length === 0) return Promise.resolve();

    // 🔥 NÃO atualiza `ultimoEstadoSincronizado` aqui no `.then()`: o Firebase já
    // dispara o `onValue` do listener abaixo (eco da própria escrita) ANTES do
    // round-trip desta Promise terminar, então quem avança a baseline é sempre
    // o listener — nunca este `.then()`. Se fizéssemos isso aqui, um `onValue`
    // que chegasse nesse meio-tempo com uma mudança concorrente legítima (ex:
    // o Mestre editando esta mesma ficha pelo Painel) teria sua baseline mais
    // atual pisoteada por este snapshot antigo, fazendo o PRÓXIMO save reverter
    // aquela mudança concorrente — exatamente o bug que este diff parcial
    // deveria eliminar.
    return update(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}`), alteracoes)
        .catch((err) => { throw err; });
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
// 🔥 ESCUTA ATIVA (real-time) da PRÓPRIA ficha: antes, a ficha do jogador só
// era carregada uma vez (get único) ao montar o app — qualquer mudança feita
// por outra aba, outro dispositivo do mesmo jogador, ou pelo Mestre direto no
// Firebase (PainelMestreSandbox) só aparecia depois de um F5. Agora usa
// onValue, então a ficha atualiza sozinha.
// callback(dados, primeiraCarga): `primeiraCarga` é true só na primeira vez
// que este listener recebe dados (equivalente ao antigo get() inicial) — o
// chamador deve usar isso para decidir entre "carregar/migrar do zero"
// (carregarDadosFicha) e "mesclar" (já é feito aqui dentro, o callback só é
// avisado para poder rodar efeitos colaterais de primeira carga, como a
// migração de passivas).
export function iniciarListenerFichaPropria(nome, callback) {
    if (isInPlasmicCanvas()) return () => {};
    const nomeSanitizado = sanitizarNome(nome);
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !nomeSanitizado) return () => {};
    // 🔥 Não usa "já recebi algum snapshot" como sinal de "primeira carga" —
    // um personagem NOVO recebe um primeiro snapshot com `dados === null`
    // (ainda não existe no Firebase). Se um segundo snapshot trouxer dados
    // reais logo em seguida (ex: outra aba do mesmo jogador salvou primeiro),
    // esse precisa CONTINUAR sendo tratado como "primeira carga" — é a
    // primeira vez que existe algo pra rodar as migrações de
    // carregarDadosFicha (statusPool, passivas->poderes, defaults etc.), não
    // um merge contra uma baseline vazia.
    let dadosJaRecebidos = false;
    return onValue(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}`), (snapshot) => {
        const dados = snapshot.val();

        if (!dadosJaRecebidos) {
            if (dados) {
                dadosJaRecebidos = true;
                ultimoEstadoSincronizado = JSON.parse(JSON.stringify(dados));
            }
            if (callback) callback(dados, true);
            return;
        }

        // 🔥 MERGE 3 VIAS: nunca sobrescreve cegamente a ficha local com o
        // que chegou do Firebase — campos que o jogador editou localmente
        // e ainda não foram salvos (fora do baseline) continuam vencendo,
        // só os campos "intocados" desde a última sync recebem o valor
        // remoto. Isso evita perder edições rápidas feitas entre um
        // debounce e outro quando um snapshot remoto chega no meio.
        if (dados) {
            const { minhaFicha, setMinhaFicha } = useStore.getState();
            setMinhaFicha(mesclarComRemoto(ultimoEstadoSincronizado || {}, minhaFicha, dados));
            ultimoEstadoSincronizado = JSON.parse(JSON.stringify(dados));
        }

        if (callback) callback(dados, false);
    });
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
// 🔥 Último estado do `cenario` confirmado no Firebase (mesmo papel de
// `ultimoEstadoSincronizado` pra ficha, ver salvarFirebaseImediato acima): baseline
// pra calcular o diff de saída em salvarCenarioCompleto. `null` = ainda não
// sincronizou nada nesta sessão/mesa.
let ultimoCenarioSincronizado = null;

// 🔥 Reseta a baseline de sincronização do Cenário — precisa ser chamado sempre que
// o jogador troca de mesa, senão o diff de saída seria calculado contra o Cenário
// da mesa ANTERIOR (mesmo motivo de resetSincronizacaoFicha).
export function resetSincronizacaoCenario() {
    ultimoCenarioSincronizado = null;
}

export function iniciarListenerCenario(callback) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/cenario`), (snapshot) => {
        const dados = snapshot.val() || { ativa: 'default', lista: { default: { nome: 'Cenário Inicial', img: '', escala: 1.5, unidade: 'm' } } };
        // 🔥 Avança a baseline aqui, no eco do listener — nunca no .then() de
        // salvarCenarioCompleto (mesmo motivo do listener da ficha própria: evita que
        // uma escrita concorrente legítima, chegando entre o fim do PUT HTTP e o
        // round-trip da Promise, seja pisoteada por uma baseline desatualizada).
        ultimoCenarioSincronizado = JSON.parse(JSON.stringify(dados));
        if (callback) callback(dados);
    });
}
export function salvarCenarioCompleto(dadosCenario) {
    if (isInPlasmicCanvas()) return Promise.resolve(true);
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return Promise.resolve(true);

    // 🔥 ATUALIZAÇÃO PARCIAL (não mais `set()` do Cenário inteiro): manda pro Firebase
    // só os campos/Cenas que mudaram desde a última sincronização, via `update()`
    // multi-path em vez de `set()`. Isso evita o "esmagamento de Locais" — antes, dois
    // Mestres/jogadores criando Cenas DIFERENTES ao mesmo tempo cada um lia o
    // `cenario.lista` local (sem a Cena do outro, que ainda não tinha chegado),
    // adicionava a própria Cena nova, e sobrescrevia a árvore `cenario` INTEIRA com
    // `set()` — quem escrevesse por último apagava a Cena que o outro tinha acabado
    // de criar, mesmo elas tendo IDs diferentes. `calcularDiffFirebase` recursa em
    // objetos simples (então `lista.novaCenaId` vira um path próprio no diff, só ele é
    // enviado) mas trata arrays como atômicos (ex: `zonas` continua substituído por
    // inteiro se mudar — arrays de Zonas concorrentes não são o problema relatado).
    const alteracoes = calcularDiffFirebase(ultimoCenarioSincronizado, dadosCenario);
    if (Object.keys(alteracoes).length === 0) return Promise.resolve(true);

    // Resolve pra true/false (nunca rejeita) — mesmo motivo de antes: quem estiver
    // criando/publicando uma Cena crítica (ex: MapaMundi.jsx) pode checar o resultado e
    // avisar o usuário, mas os ~13 outros call-sites fire-and-forget não tratam o
    // retorno e não devem gerar ruído de rejeição não tratada.
    return update(ref(db, `mesas/${mesaId}/cenario`), alteracoes).then(() => true).catch((err) => {
        console.warn('Falha ao sincronizar o Cenário com o Firebase:', err);
        return false;
    });
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
        // 🔥 Se a mesa nunca teve esse valor gravado com sucesso no Firebase (nó ausente/inválido —
        // ex.: uma escrita anterior falhou silenciosamente por regra de segurança), NÃO sobrescreve
        // o valor já carregado do cache local (localStorage, ver lerDivisorPoderMesaLocal em
        // useStore.js) com o "1" padrão. Só repassa um valor real vindo do Firebase, preservando
        // assim o que este navegador já sabia entre um F5 e outro mesmo se a escrita remota falhar.
        if (!isNaN(val) && val > 0 && callback) callback(val);
    });
}
export function salvarDivisorPoderMesa(valor) {
    if (isInPlasmicCanvas()) return Promise.resolve(true);
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return Promise.resolve(true);
    // 🔥 Retorna uma Promise que resolve pra true/false (igual salvarCenarioCompleto, nunca rejeita):
    // sem isso, uma escrita que falhasse deixava o navegador de quem editou com um valor "próprio"
    // pra sempre (o setDivisorPoderMesa local já rodou otimista antes desta chamada) enquanto o
    // resto da mesa ficava com o valor antigo/nenhum no Firebase — cada um via um Poder Atual
    // diferente pro MESMO personagem, sem nada avisar.
    return set(ref(db, `mesas/${mesaId}/divisorPoderPadrao`), valor).then(() => true).catch((err) => {
        console.warn('Falha ao sincronizar o Divisor de Poder da mesa com o Firebase (o valor continua salvo localmente neste navegador):', err);
        return false;
    });
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
// 🔥 FERRAMENTA DE DANO RÁPIDO DO MESTRE (Mapa) — escreve DIRETO em vida/atual de um jogador
// QUALQUER (não só o do cliente que está chamando), mesmo esquema de zerarIniciativaGlobal acima
// (escrita pontual num campo específico, nunca a ficha inteira, pra não apagar edições
// concorrentes do próprio dono). Só o Mestre/Co-Mestre chama isso (ver MapaFormContext.jsx >
// aplicarDanoRapido) — como não existe transação aqui, dois Mestres aplicando dano no mesmo alvo
// quase ao mesmo tempo podem se sobrepor (o segundo clique "ganha"); aceitável pro uso real (GM
// clicando um dano por vez), mas documentado caso vire um problema no futuro.
export function aplicarDanoDireto(nome, novoValorVidaAtual) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !nome) return;
    const nomeSanitizado = sanitizarNome(nome);
    set(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}/vida/atual`), Math.max(0, novoValorVidaAtual)).catch(() => {});
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