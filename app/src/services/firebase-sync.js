import { ref, set, update, get, push, remove, runTransaction, onValue, onChildAdded, onChildChanged, limitToLast, orderByKey, endBefore, query, onDisconnect } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase-config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import useStore, { sanitizarNome, registrarAoDescartarFicha } from '../stores/useStore';
import { calcularDiffFirebase, mesclarComRemoto } from '../core/utils.js';
import { deveSerPrivada, lerDadosMestrePrivados, acertoDeveFicarOculto, lerAcertoOculto } from '../core/dadosMestre.js';

let _modoPlasmic = false;
export function setModoPlasmic(ativo) { _modoPlasmic = ativo; }
function isInPlasmicCanvas() { return _modoPlasmic; }

// ⚠️ Falha de gravação nunca é engolida: avisa o jogador (toast) e registra no console. Janela de 5 s por texto, para não empilhar toasts.
const _ultimoAvisoFalha = {};
export function avisarFalhaGravacao(texto, err) {
    try { console.warn(texto, err); } catch (e) { /* sem console */ }
    const agora = Date.now();
    if (_ultimoAvisoFalha[texto] && agora - _ultimoAvisoFalha[texto] < 5000) return;
    _ultimoAvisoFalha[texto] = agora;
    try {
        const st = useStore.getState();
        if (st && typeof st.adicionarAviso === 'function') st.adicionarAviso(texto, 'alerta');
    } catch (e) { /* store indisponível */ }
}

// 🔥 Soma um DELTA (e não um valor absoluto) a um número do Firebase numa transação: dois danos quase simultâneos de clientes diferentes se
// acumulam em vez de um sobrescrever o outro. `fallback` = o valor que o cliente conhecia (usado só se o nó ainda não está no cache local).
// Piso 0; `teto` (opcional, > 0) limita o resultado de uma CURA. Devolve a Promise (true = gravou; falha avisa o jogador).
// Valor atual ausente (null/undefined/NaN; o 1º passo da transação pode rodar com o cache local vazio) usa o `fallback`, nunca 0.
// `existe` (opcional): () => false quando o store já sabe que o dono do nó foi APAGADO; aí a transação aborta e não recria um nó parcial.
// `applyLocally:false`: o valor provisório não aparece na tela antes de o servidor confirmar (sem "flash" de Vida errada).
function somarDeltaTransacional(refNo, delta, fallback, teto, textoErro, existe) {
    return runTransaction(refNo, (atual) => {
        const ausente = atual === null || atual === undefined || !Number.isFinite(Number(atual));
        if (ausente && typeof existe === 'function' && !existe()) return undefined;
        const base = ausente ? (Number(fallback) || 0) : Number(atual);
        let novo = Math.max(0, base + delta);
        if (Number.isFinite(teto) && teto > 0 && delta > 0) novo = Math.min(novo, Math.max(teto, base));
        return novo;
    }, { applyLocally: false }).then(() => true).catch((err) => { avisarFalhaGravacao(textoErro, err); return false; });
}

// O store ainda conhece este item de uma coleção (personagens/dummies)? Coleção vazia/não carregada = "não sei" = true (não aborta).
function existeNoStore(colecao, chaves) {
    try {
        const c = useStore.getState()[colecao];
        if (!c || typeof c !== 'object' || Object.keys(c).length === 0) return true;
        return chaves.some(k => c[k] !== undefined && c[k] !== null);
    } catch (e) { return true; }
}

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
            onDisconnect(myConnectionsRef).remove().then(() => set(myConnectionsRef, true)).catch(() => {});
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
            // Só assume o nome da conta se NENHUM personagem já foi restaurado (reload com personagem escolhido): senão a ficha dele ficaria sob o nome da conta.
            if (!useStore.getState().meuNome) {
                useStore.getState().setMeuNome(nick);
                try { localStorage.setItem('rpgNome', nick); } catch (e) { /* sem localStorage */ } // Garante a retrocompatibilidade com a Web
            }
            
            callback(nick);
        }
        else {
            useStore.getState().setMeuNome('');
            try { localStorage.removeItem('rpgNome'); } catch (e) { /* sem localStorage */ }
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
    debounceTimer = setTimeout(() => { salvarFirebaseImediato().catch((err) => avisarFalhaGravacao('⚠️ Não foi possível salvar a ficha no servidor' + (err && err.code ? ` (${err.code})` : '') + ': as alterações ficam só neste navegador por enquanto.', err)); }, 500);
}

// 🔥 Último estado da ficha confirmado no Firebase (o que este cliente sabe que
// está lá agora). Serve de baseline tanto para calcular o diff de saída (o que
// realmente mudou desde a última sincronização) quanto para o merge de entrada
// (mesclarComRemoto, no listener em tempo real abaixo). `null` = ainda não
// sincronizou nada nesta sessão/personagem.
let ultimoEstadoSincronizado = null;

// 🔒 TRAVA CONTRA SOBRESCREVER A FICHA COM UMA CÓPIA VELHA. O app abre com a cópia local do computador (que pode ter semanas) antes
// de falar com o Firebase; um salvamento nessa janela, ou depois de uma leitura que falhou, gravava a ficha INTEIRA velha por cima da
// ficha da nuvem (a baseline ainda era null, então o "diff" era a ficha toda). Agora NENHUM envio da própria ficha sai enquanto o app não
// tiver LIDO o servidor nesta sessão para este personagem:
//   'desconhecido' = ainda não leu (ou a leitura falhou) → envio bloqueado;
//   'existe'       = leu e a ficha existe na nuvem (a baseline é o que veio de lá);
//   'inexistente'  = o servidor respondeu que ainda não há ficha (personagem novo) → pode criar.
let confirmacaoRemota = 'desconhecido';
// A confirmação vale SÓ para uma mesa + personagem (chave "mesa/nome"): trocar de nome ou de mesa a invalida na hora, sem esperar o efeito do React
// rodar, e uma leitura que demora e termina depois da troca não libera o personagem novo.
let confirmadoPara = '';
let ultimoAvisoBloqueio = 0;

function chaveDaFicha(nome) {
    const { mesaId, meuNome } = useStore.getState();
    const n = sanitizarNome(nome !== undefined && nome !== null && nome !== '' ? nome : (meuNome || ''));
    return mesaId && n ? `${mesaId}/${n}` : '';
}

// Confirmada PARA a ficha em uso agora (mesa + personagem atuais)?
export function remotoConfirmado() {
    return confirmacaoRemota !== 'desconhecido' && confirmadoPara !== '' && confirmadoPara === chaveDaFicha();
}

// Chamada por quem acabou de ler o servidor com SUCESSO (listener em tempo real ou leitura direta no login).
// `dados` = o que veio da nuvem (null/vazio = o servidor respondeu que não há ficha).
// `nome` = de quem é a leitura (padrão: o personagem em uso agora). Leitura de OUTRO personagem que não o atual é ignorada.
export function confirmarLeituraRemota(dados, nome) {
    const chave = chaveDaFicha(nome);
    if (!chave || chave !== chaveDaFicha()) return; // leitura atrasada de um personagem/mesa que já não é o atual
    const existe = !!dados && typeof dados === 'object' && Object.keys(dados).length > 0;
    confirmacaoRemota = existe ? 'existe' : 'inexistente';
    confirmadoPara = chave;
    // Sem baseline ainda: a leitura vira a baseline (o próximo envio manda só o que mudou em cima do que está na nuvem).
    if (existe && ultimoEstadoSincronizado === null) ultimoEstadoSincronizado = JSON.parse(JSON.stringify(dados));
}

// O nó do MEU personagem sumiu do servidor depois de existir (apagado por outra pessoa); libera quando dados voltarem ao nó (recriado) ou ao trocar de personagem.
let apagadoNaNuvem = false;
let ultimoWarnSalvamentoBloqueado = 0;
function avisarEnvioBloqueado() {
    const agora = Date.now();
    if (agora - ultimoAvisoBloqueio < 20000) return;
    ultimoAvisoBloqueio = agora;
    try {
        const adicionar = useStore.getState().adicionarAviso;
        if (typeof adicionar === 'function' && apagadoNaNuvem) adicionar('⚠️ Este personagem foi apagado do servidor por outra pessoa: as alterações NÃO foram enviadas. Entre no personagem de novo para recriá-lo.', 'alerta');
        else if (typeof adicionar === 'function') adicionar('⚠️ A ficha ainda não sincronizou com o servidor, então a alteração NÃO foi enviada (isso evita sobrescrever a ficha da nuvem com uma cópia antiga). Espere conectar e repita.', 'alerta');
    } catch (e) { /* sem store: só não avisa */ }
}

// 🔥 Reseta a baseline de sincronização — precisa ser chamado sempre que o
// jogador troca de mesa ou de personagem, senão o diff/merge do personagem
// NOVO seria calculado contra o estado do personagem ANTERIOR. Também cancela
// um debounce pendente: sem isso, um save agendado para o personagem ANTIGO
// podia disparar depois da troca e gravar a ficha errada no personagem NOVO.
try { registrarAoDescartarFicha(() => resetSincronizacaoFicha()); } catch (e) { /* store simulado sem o gancho */ }
export function resetSincronizacaoFicha() {
    ultimoEstadoSincronizado = null;
    confirmacaoRemota = 'desconhecido';
    confirmadoPara = '';
    ultimoAvisoBloqueio = 0;
    apagadoNaNuvem = false;
    clearTimeout(debounceTimer);
    debounceTimer = null;
}

export function salvarFirebaseImediato() {
    if (isInPlasmicCanvas()) return Promise.resolve();
    const { minhaFicha, meuNome, mesaId } = useStore.getState();
    const nomeSanitizado = sanitizarNome(meuNome);
    if (!nomeSanitizado || !mesaId) return Promise.resolve();

    // 🔒 A ficha em memória é de OUTRO nome (carregada sob um personagem e o nome ativo mudou): nunca grava no caminho do nome ativo.
    const { fichaDono } = useStore.getState();
    if (fichaDono && fichaDono !== meuNome) { const agoraW = Date.now(); if (agoraW - ultimoWarnSalvamentoBloqueado > 10000) { ultimoWarnSalvamentoBloqueado = agoraW; console.warn('Salvamento bloqueado: a ficha carregada pertence a', fichaDono, 'e o personagem ativo é', meuNome); } return Promise.resolve(); }

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

    // 🔒 Sem leitura confirmada do servidor, nada é enviado (a cópia local acima continua sendo salva).
    if (!remotoConfirmado()) { avisarEnvioBloqueado(); return Promise.resolve(); }

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
// Igual a carregarFichaDoFirebase, mas distingue "o servidor respondeu que não há ficha" ({ ok: true, dados: null }) de "não consegui
// ler" ({ ok: false }: sem rede, sem mesa, erro). Só com ok === true vale confirmar a leitura e deixar a ficha ser enviada depois.
export async function lerFichaDoFirebaseSeguro(nome) {
    if (isInPlasmicCanvas()) return { ok: false, dados: null };
    const nomeSanitizado = sanitizarNome(nome);
    const { mesaId } = useStore.getState();
    if (!nomeSanitizado || !db || !mesaId) return { ok: false, dados: null };
    try {
        const snapshot = await get(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}`));
        return { ok: true, dados: snapshot.exists() ? snapshot.val() : null };
    } catch (err) { return { ok: false, dados: null }; }
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
            // 🔒 O servidor respondeu (com a ficha ou dizendo que ela não existe): a partir daqui o envio é liberado.
            confirmacaoRemota = dados ? 'existe' : 'inexistente';
            confirmadoPara = `${mesaId}/${nomeSanitizado}`;
            if (callback) callback(dados, true);
            return;
        }

        // 🔥 MERGE 3 VIAS: nunca sobrescreve cegamente a ficha local com o
        // que chegou do Firebase — campos que o jogador editou localmente
        // e ainda não foram salvos (fora do baseline) continuam vencendo,
        // só os campos "intocados" desde a última sync recebem o valor
        // remoto. Isso evita perder edições rápidas feitas entre um
        // debounce e outro quando um snapshot remoto chega no meio.
        // 🗑️ O nó do MEU personagem sumiu depois de existir (apagado por outra pessoa): trava o envio, para um edit posterior não recriar um
        // personagem "fantasma" parcial nem ressuscitar o apagado. Recarregar/entrar de novo no personagem libera.
        if (!dados && confirmacaoRemota === 'existe' && confirmadoPara === `${mesaId}/${nomeSanitizado}`) {
            confirmacaoRemota = 'desconhecido';
            apagadoNaNuvem = true;
            ultimoEstadoSincronizado = null;
            clearTimeout(debounceTimer);
            avisarFalhaGravacao('⚠️ Este personagem foi apagado por outra pessoa. As alterações NÃO serão enviadas; entre no personagem de novo para recriá-lo.');
        }
        if (dados && apagadoNaNuvem) {
            // O nó voltou (recriado): reconfirma a leitura, a baseline passa a ser o que está na nuvem (que vale) e o envio é liberado.
            apagadoNaNuvem = false;
            confirmacaoRemota = 'existe';
            confirmadoPara = `${mesaId}/${nomeSanitizado}`;
            ultimoEstadoSincronizado = JSON.parse(JSON.stringify(dados));
            useStore.getState().carregarDadosFicha(dados, useStore.getState().meuNome);
        } else if (dados) {
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
// 🔥 GRIMÓRIO DA ENTIDADE — sincronização de uma ficha ALHEIA (Mestre editando outra entidade)
// ==========================================
// Mesmo diff/baseline/debounce de salvarFirebaseImediato/salvarFichaSilencioso acima, mas por
// NOME (Map, não uma variável global única) -- só existe enquanto o Mestre tem aquela entidade
// aberta pra edição no Grimório da Entidade (FichaAlvoContext.jsx). Outras entidades da mesa
// continuam só sendo sobrescritas pelo snapshot bruto do listener (iniciarListenerPersonagens),
// sem baseline, porque ninguém está editando-as localmente por este caminho.
const debounceTimersAlvo = new Map();
const baselinesAlvo = new Map();
// Quantos "miradores" (Grimório da Entidade, Atuar como do Mestre) estão olhando cada ficha alheia: a baseline só nasce no
// primeiro e só some quando o último sai — senão fechar o Grimório de um NPC apagava a baseline de quem ainda atuava como ele.
const usosAlvo = new Map();

// Chamado ao abrir o Grimório pra uma entidade que não é "eu mesmo" -- inicia o rastreamento de
// baseline dela a partir do que já está carregado localmente. Chamar de novo ao fechar o
// Grimório/trocar de entidade evita que uma sessão de edição anterior "vaze" pro diff da próxima.
export function iniciarSincronizacaoFichaAlvo(nome) {
    if (!nome) return;
    const chave = sanitizarNome(nome);
    const { personagens } = useStore.getState();
    const atual = personagens && personagens[nome];
    const usos = (usosAlvo.get(chave) || 0) + 1;
    usosAlvo.set(chave, usos);
    // Outro mirador já acompanha esta ficha (e já tem baseline): não reinicia, pra não descartar uma edição pendente.
    if (usos > 1 && baselinesAlvo.has(chave)) return;
    baselinesAlvo.set(chave, atual ? JSON.parse(JSON.stringify(atual)) : null);
}

export function pararSincronizacaoFichaAlvo(nome) {
    if (!nome) return;
    const chave = sanitizarNome(nome);
    // Ainda há outro mirador nesta ficha: só diminui a contagem (nada de achatar nem descartar a baseline dele).
    const restantes = (usosAlvo.get(chave) || 1) - 1;
    if (restantes > 0) { usosAlvo.set(chave, restantes); return; }
    usosAlvo.delete(chave);
    // 🔥 Achata uma edição pendente ANTES de descartar o timer/baseline -- sem isto, fechar o
    // Grimório logo depois de editar um campo perdia a última mudança em silêncio: o blur do
    // campo agenda um save daqui a 500ms (salvarFichaAlvoSilencioso), mas fechar o Grimório
    // desmonta o FichaAlvoProvider (e chama esta função) antes desse tempo passar, cancelando o
    // timer sem a mudança nunca ter ido pro Firebase -- e como a baseline também some aqui, o
    // próximo snapshot remoto da mesa sobrescreve a entidade de volta pro valor antigo sem aviso.
    if (debounceTimersAlvo.has(chave)) {
        clearTimeout(debounceTimersAlvo.get(chave));
        salvarFichaAlvoImediato(nome).catch(() => {});
    }
    debounceTimersAlvo.delete(chave);
    baselinesAlvo.delete(chave);
}

export function salvarFichaAlvoImediato(nome) {
    if (isInPlasmicCanvas() || !nome) return Promise.resolve();
    const chave = sanitizarNome(nome);
    const { meuNome, mesaId, personagens } = useStore.getState();
    // Mirando o próprio Mestre: usa o caminho normal (minhaFicha/meuNome continuam a única fonte
    // de verdade pro PRÓPRIO personagem dele, igual updateFichaAlvo já faz no store).
    if (chave === sanitizarNome(meuNome || '')) return salvarFirebaseImediato();
    if (!db || !mesaId) return Promise.resolve();

    const fichaAtual = personagens && personagens[nome];
    if (!fichaAtual) return Promise.resolve();
    const fichaParaSalvar = JSON.parse(JSON.stringify(fichaAtual));

    if (fichaAtual.dominios && !fichaParaSalvar.dominios) fichaParaSalvar.dominios = fichaAtual.dominios;

    const baseline = baselinesAlvo.has(chave) ? baselinesAlvo.get(chave) : null;
    const alteracoes = calcularDiffFirebase(baseline, fichaParaSalvar);
    if (Object.keys(alteracoes).length === 0) return Promise.resolve();

    // Mesmo motivo do "não atualiza aqui" de salvarFirebaseImediato: quem avança a baseline é
    // sempre o listener da mesa (mesclarPersonagensRemotos), nunca este .then() -- senão um
    // snapshot concorrente (o próprio jogador editando esta ficha ao mesmo tempo) teria sua
    // baseline mais atual pisoteada por este envio, revertendo aquela mudança no próximo save.
    return update(ref(db, `mesas/${mesaId}/personagens/${chave}`), alteracoes);
}

export function salvarFichaAlvoSilencioso(nome) {
    if (isInPlasmicCanvas() || !nome) return;
    const chave = sanitizarNome(nome);
    clearTimeout(debounceTimersAlvo.get(chave));
    debounceTimersAlvo.set(chave, setTimeout(() => { salvarFichaAlvoImediato(nome).catch(() => {}); }, 500));
}

// Usado pelo listener da mesa inteira (iniciarListenerPersonagens, via hooks/useFirebase.js): pra
// qualquer entidade SEM baseline ativa aqui (ninguém editando-a pelo Grimório agora), devolve o
// snapshot remoto como sempre foi (sobrescrita direta). Pra a(s) que tiverem, aplica o mesmo merge
// 3 vias que a própria ficha usa (mesclarComRemoto) -- sem isso, uma digitação do Mestre no
// Grimório podia "voltar" no meio de uma frase sempre que QUALQUER OUTRO personagem da mesa
// mudasse algo (o listener reage à árvore `personagens` inteira, não só à entidade aberta).
export function mesclarPersonagensRemotos(personagensLocais, personagensRemotos) {
    if (baselinesAlvo.size === 0) return personagensRemotos;
    const resultado = { ...personagensRemotos };
    baselinesAlvo.forEach((baseline, chave) => {
        const nome = Object.keys(personagensRemotos).find(k => sanitizarNome(k) === chave)
            || Object.keys(personagensLocais || {}).find(k => sanitizarNome(k) === chave);
        if (!nome) return;
        const remoto = personagensRemotos[nome];
        const local = personagensLocais && personagensLocais[nome];
        if (remoto && local) resultado[nome] = mesclarComRemoto(baseline || {}, local, remoto);
        baselinesAlvo.set(chave, remoto ? JSON.parse(JSON.stringify(remoto)) : baseline);
    });
    return resultado;
}

// ==========================================
// 🔥 OUTROS SISTEMAS DE MESA 🔥
// ==========================================
// Cada entrada chega com `_chave` (a chave no Firebase), que o Mestre usa pra revelar uma rolagem privada.
// `aoAlterar` roda quando uma entrada já existente muda (ex.: o Mestre revelou uma rolagem privada).
export function iniciarListenerFeed(callback, aoAlterar) {
    if (isInPlasmicCanvas()) return () => {};
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    const feedRef = query(ref(db, `mesas/${mesaId}/feed_combate`), limitToLast(50));
    const cancelaNovas = onChildAdded(feedRef, (snapshot) => {
        const entry = snapshot.val();
        if (entry && callback) callback({ ...entry, _chave: snapshot.key });
    });
    let cancelaAlteradas = null;
    if (aoAlterar) {
        try {
            cancelaAlteradas = onChildChanged(feedRef, (snapshot) => {
                const entry = snapshot.val();
                if (entry) aoAlterar({ ...entry, _chave: snapshot.key });
            });
        } catch (e) { cancelaAlteradas = null; }
    }
    return () => {
        if (typeof cancelaNovas === 'function') cancelaNovas();
        if (typeof cancelaAlteradas === 'function') cancelaAlteradas();
    };
}
// 🎲 Dados do Mestre: as rolagens de quem está como Mestre vão como `privado: true` (só Mestre/Co-Mestre veem) a não ser que
// ele desligue o padrão ou a entrada já traga `privado` definido. Narrações do sistema nunca são privadas.
// 🧹 Poda do feed no Firebase: mantém as últimas LIMITE_FEED_FIREBASE entradas. Roda a cada PODA_FEED_A_CADA envios DESTE cliente (não a cada envio):
// lê as últimas N (a mais antiga delas é o marco) e apaga, em lotes, as chaves anteriores (as chaves do push são ordenadas pelo tempo).
const LIMITE_FEED_FIREBASE = 1500; // = o que a Sexta-Feira lê para resumir sessões (sextaFeiraDados: limitToLast(1500))
const PODA_FEED_A_CADA = 60;
const LOTE_PODA_FEED = 100;
let enviosDesdeAPoda = 0;
async function podarFeedNoFirebase(mesaId) {
    try {
        const base = ref(db, `mesas/${mesaId}/feed_combate`);
        const recentes = await get(query(base, limitToLast(LIMITE_FEED_FIREBASE)));
        if (!recentes.exists()) return;
        const chaves = Object.keys(recentes.val() || {});
        if (chaves.length < LIMITE_FEED_FIREBASE) return; // nada antes do marco
        const marco = chaves.sort()[0];
        const antigas = await get(query(base, orderByKey(), endBefore(marco), limitToLast(LOTE_PODA_FEED)));
        if (!antigas.exists()) return;
        const apagar = {};
        Object.keys(antigas.val() || {}).forEach((k) => { apagar[k] = null; });
        if (Object.keys(apagar).length > 0) await update(base, apagar);
    } catch (e) { /* poda é só higiene: falhar não atrapalha a mesa */ }
}
export function enviarParaFeed(d) {
    if (isInPlasmicCanvas()) return;
    const { mesaId, isMestre } = useStore.getState();
    if (!db || !mesaId) return;
    const privado = deveSerPrivada(d, { ehMestre: isMestre, privadosPorPadrao: lerDadosMestrePrivados() });
    // O Acerto do Mestre continua público (o jogador alvo precisa saber se foi atingido), mas pode sair sem o valor do dado.
    const valorOculto = acertoDeveFicarOculto(d, { ehMestre: isMestre, ocultarPorPadrao: lerAcertoOculto() });
    const entrada = { ...d, ...(privado ? { privado: true } : {}), ...(valorOculto ? { valorOculto: true } : {}) };
    push(ref(db, `mesas/${mesaId}/feed_combate`), privado || valorOculto ? entrada : d).catch(() => {});
    enviosDesdeAPoda += 1;
    if (enviosDesdeAPoda >= PODA_FEED_A_CADA) { enviosDesdeAPoda = 0; podarFeedNoFirebase(mesaId); }
}
// Torna pública uma rolagem privada do Mestre (ela aparece, com a animação, no feed dos jogadores).
export function revelarEntradaFeed(chave) {
    if (isInPlasmicCanvas() || !chave) return Promise.resolve(false);
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return Promise.resolve(false);
    return update(ref(db, `mesas/${mesaId}/feed_combate/${chave}`), { privado: false }).then(() => true).catch(() => false);
}
export async function deletarPersonagem(nome) {
    if (isInPlasmicCanvas()) return;
    const nomeSanitizado = sanitizarNome(nome);
    const { mesaId } = useStore.getState();
    if (!nomeSanitizado || !mesaId) return;
    try { localStorage.removeItem('rpgFicha_' + nomeSanitizado); } catch (err) {}
    if (!db) return;
    // Apagando o MEU personagem: o listener vai ver o nó sumir; isso é esperado, não é "apagado por outra pessoa".
    if (chaveDaFicha(nome) === chaveDaFicha()) { confirmacaoRemota = 'desconhecido'; ultimoEstadoSincronizado = null; clearTimeout(debounceTimer); }
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
// Grava um Dummie. Se ele já existe no store, grava SÓ os campos que mudaram (update por caminho) em vez do objeto inteiro (um golpe e um
// arrastar de posição, ou dois golpes, não se apagam mais). `opcoes.baseHp` = a Vida que o cliente conhecia: o campo `hpAtual` vira DELTA
// transacional (novo - baseHp), com piso 0 e teto `opcoes.hpMax`. Sem Dummie no store (criação), grava o objeto inteiro como antes.
export function salvarDummie(id, dadosDummie, opcoes = {}) {
    if (isInPlasmicCanvas()) return;
    const { mesaId, dummies } = useStore.getState();
    if (!db || !mesaId) return;
    const textoErro = 'Não foi possível gravar o Dummie no servidor: a alteração pode não ter sido salva.';
    const atual = dummies && dummies[id];
    if (!atual || typeof atual !== 'object' || !dadosDummie || typeof dadosDummie !== 'object') {
        set(ref(db, `mesas/${mesaId}/dummies/${id}`), dadosDummie).catch((err) => avisarFalhaGravacao(textoErro, err));
        return;
    }
    const igual = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
    const usaDelta = Number.isFinite(Number(opcoes.baseHp)) && Number.isFinite(Number(dadosDummie.hpAtual));
    const mudados = {}; const removidos = [];
    Object.keys(dadosDummie).forEach((k) => {
        if (usaDelta && k === 'hpAtual') return;
        if (!igual(dadosDummie[k], atual[k])) mudados[k] = dadosDummie[k];
    });
    Object.keys(atual).forEach((k) => { if (!(k in dadosDummie) && !(usaDelta && k === 'hpAtual')) removidos.push(k); });
    const delta = usaDelta ? Number(dadosDummie.hpAtual) - Number(opcoes.baseHp) : 0;
    if (Object.keys(mudados).length === 0 && removidos.length === 0 && delta === 0) return;
    // Uma TRANSAÇÃO no nó do Dummie: só os campos alterados (+ a Vida por delta) e nunca recria um Dummie apagado por outro cliente em voo.
    runTransaction(ref(db, `mesas/${mesaId}/dummies/${id}`), (cur) => {
        if (cur === null || cur === undefined || typeof cur !== 'object') {
            if (!existeNoStore('dummies', [id])) return undefined; // apagado: aborta
            cur = JSON.parse(JSON.stringify(atual)); // 1º passo com o cache vazio: parte do que o cliente conhecia
        }
        const prox = { ...cur };
        Object.keys(mudados).forEach((k) => { if (mudados[k] === undefined || mudados[k] === null) delete prox[k]; else prox[k] = mudados[k]; });
        removidos.forEach((k) => { delete prox[k]; });
        if (usaDelta && delta !== 0) {
            const n = Number(cur.hpAtual);
            const base = Number.isFinite(n) ? n : Number(opcoes.baseHp);
            const teto = Number(opcoes.hpMax);
            let novo = Math.max(0, base + delta);
            if (Number.isFinite(teto) && teto > 0 && delta > 0) novo = Math.min(novo, Math.max(teto, base));
            prox.hpAtual = novo;
        }
        return prox;
    }, { applyLocally: false }).catch((err) => avisarFalhaGravacao(textoErro, err));
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
// `opcoes.base` (a Vida que o cliente conhecia) liga o modo TRANSACIONAL: grava `atual + (novo - base)` com piso 0 e teto `opcoes.max` (cura),
// então dois danos simultâneos se somam. Sem `base`, mantém o `set` absoluto de sempre.
export function aplicarDanoDireto(nome, novoValorVidaAtual, opcoes = {}) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !nome) return;
    const nomeSanitizado = sanitizarNome(nome);
    const refVida = ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}/vida/atual`);
    const textoErro = `Não foi possível gravar o dano em ${nome} no servidor: a Vida dele pode não ter mudado.`;
    if (opcoes && Number.isFinite(Number(opcoes.base))) {
        const delta = Math.max(0, novoValorVidaAtual) - Number(opcoes.base);
        if (delta === 0) return; // nada mudou: não grava à toa
        somarDeltaTransacional(refVida, delta, opcoes.base, Number(opcoes.max), textoErro, () => existeNoStore('personagens', [nome, nomeSanitizado]));
        return;
    }
    set(refVida, Math.max(0, novoValorVidaAtual)).catch((err) => avisarFalhaGravacao(textoErro, err));
}
// 🔥 Mesmo esquema de aplicarDanoDireto acima, mas para VÁRIOS campos pontuais de uma vez —
// usado por avancarTurno (ver MapaFormContext.jsx) pra aplicar a Regeneração/Ações/Fadiga de
// início de turno DIRETO no personagem cujo turno está começando, mesmo que não seja o meu e
// mesmo que o navegador DELE não esteja aberto neste exato momento. Antes, a Regeneração de um
// jogador real só rodava através de um efeito que só existe no PRÓPRIO navegador daquele jogador
// (só ele pode mutar `minhaFicha`) — se a aba dele não estivesse aberta bem na hora em que o turno
// chegasse, a Regeneração daquele round simplesmente nunca acontecia, por mais que os turnos
// continuassem passando normalmente pros outros. Agora quem quer que tenha clicado "Passar Turno"
// (o Mestre, ou o próprio jogador anterior) já aplica a conta e escreve os campos que mudaram —
// nunca a ficha inteira, só os caminhos passados em `campos` (ex: `{'vida/atual': 500}`), pra não
// apagar edições concorrentes que o dono real daquela ficha ainda não sincronizou de volta.
export function salvarCamposPersonagem(nome, campos) {
    if (isInPlasmicCanvas()) return Promise.resolve(false);
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !nome || !campos) return Promise.resolve(false);
    const nomeSanitizado = sanitizarNome(nome);
    const updates = {};
    Object.keys(campos).forEach((caminho) => {
        updates[`mesas/${mesaId}/personagens/${nomeSanitizado}/${caminho}`] = campos[caminho];
    });
    if (Object.keys(updates).length === 0) return Promise.resolve(false);
    // Devolve uma promessa (true = gravou, false = o servidor recusou); quem não precisa do resultado pode ignorar.
    return update(ref(db), updates).then(() => true).catch(() => false);
}
// 🔥 Mesmo esquema de aplicarDanoDireto acima, só que pro contador combate/fadigaExtra — usado
// pelo Dano Rápido do Mestre (ver MapaFormContext.jsx > aplicarDanoRapido) pra que o dano que o
// Mestre aplica em OUTRO jogador já gere Fadiga na hora, escalada pela Supressão de Poder daquele
// jogador, sem precisar esperar o turno dele voltar na iniciativa do Mapa.
export function aplicarFadigaDireta(nome, novoFadigaExtra, opcoes = {}) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !nome) return;
    const nomeSanitizado = sanitizarNome(nome);
    const refFadiga = ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}/combate/fadigaExtra`);
    const textoErro = `Não foi possível gravar a Fadiga de ${nome} no servidor.`;
    // `opcoes.base` = a Fadiga que o cliente conhecia: modo transacional (soma só o ganho deste golpe).
    if (opcoes && Number.isFinite(Number(opcoes.base))) {
        const delta = Math.max(0, novoFadigaExtra) - Number(opcoes.base);
        if (delta === 0) return; // nada mudou: não grava `fadigaExtra: 0` à toa
        somarDeltaTransacional(refFadiga, delta, opcoes.base, 0, textoErro, () => existeNoStore('personagens', [nome, nomeSanitizado]));
        return;
    }
    set(refFadiga, Math.max(0, novoFadigaExtra)).catch((err) => avisarFalhaGravacao(textoErro, err));
}
// 🔥 Mesmo esquema de aplicarFadigaDireta acima, só que pro campo combate/ultimoElementoRecebido —
// usado pelo Dano Rápido do Mestre (ver MapaFormContext.jsx > aplicarDanoRapido) quando o Mestre
// marca de qual elemento veio o golpe, pra core/fadiga.js > getFatorVidaPerdida poder descontar a
// Fadiga do alvo se ele tiver Domínio (página 3) sobre aquele elemento.
export function aplicarElementoDireto(nome, elemento) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !nome) return;
    const nomeSanitizado = sanitizarNome(nome);
    // `elemento` falsy (Mestre não marcou nenhum, golpe físico) LIMPA o campo — a resistência
    // elemental é sempre sobre o ÚLTIMO golpe, nunca deve "grudar" de um golpe elemental antigo
    // em cima de golpes físicos/não-marcados que vieram depois.
    set(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}/combate/ultimoElementoRecebido`), elemento || null).catch(() => {});
}
// 🔥 Mesmo esquema de aplicarElementoDireto acima, pro campo combate/ultimoElementoRecebidoNivel —
// o Mestre pode sobrescrever o nível de Domínio (0-10) usado no cálculo de Resistência Elemental
// (ver core/dominios.js > getFracaoResistenciaElemental) pra ESTE golpe específico, em vez de usar
// o Domínio que o próprio alvo tem registrado na Ficha (útil pra NPCs sem Domínio próprio, ou pra
// simular uma resistência pontual diferente).
export function aplicarElementoNivelDireto(nome, nivel) {
    if (isInPlasmicCanvas()) return;
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !nome) return;
    const nomeSanitizado = sanitizarNome(nome);
    set(ref(db, `mesas/${mesaId}/personagens/${nomeSanitizado}/combate/ultimoElementoRecebidoNivel`), (nivel === '' || nivel === undefined) ? null : nivel).catch(() => {});
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