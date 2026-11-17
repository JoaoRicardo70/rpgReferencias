import useStore, { sanitizarNome } from '../stores/useStore';
import { salvarFichaSilencioso, salvarDummie, salvarCenarioCompleto, salvarCamposPersonagem, enviarParaFeed } from './firebase-sync';
import { resolverAlvo } from './composicaoRacial';
import {
    getBiblioteca, sanitizarBiblioteca, criarEntradaDePoder, disponivelParaFicha, jaPossuiHabilidade, montarPoderConcedido,
    LIMITE_BIBLIOTECA, LIMITE_NOME_BIBLIOTECA, normalizarTextoBiblioteca as textoBiblioteca,
} from '../core/bibliotecaRacial';
import { ehHabilidadeDeRaca, normalizarNomeRaca, ID_CATEGORIA_HABILIDADE_RACA } from '../core/racas';
import { verificarAcessoHabilidadeRaca } from '../core/racasAcesso';

// 📚 Biblioteca de Habilidades de Raça da mesa (core/bibliotecaRacial.js). Só Mestre/Co-Mestre (isMestre efetivo; false em Modo Jogador).
// Não depende do Mapa: lê o store NO MOMENTO da chamada. Todas devolvem { ok, mensagem?, ... } e nunca lançam.
// LIMITES ACEITOS: editar ou remover uma entrada NÃO altera as cópias já concedidas (cada ficha guarda a sua); o cenário sincroniza para
// todos, então o `modelo` das entradas chega ao navegador dos jogadores (a interface não o mostra, mas não é secreto).
// Conceder: na PRÓPRIA ficha = updateFicha + salvarFichaSilencioso (debounce); em dummie = salvarDummie; em outro jogador = salvarCamposPersonagem
// anexando em `poderes/<índice>`, com o índice = tamanho da lista na ficha MAIS FRESCA do store (nunca um índice de snapshot antigo).

const MSG_SO_MESTRE = 'Só o Mestre ou Co-Mestre pode fazer isso (e não no Modo Jogador).';
const falha = (mensagem, extra = {}) => ({ ok: false, mensagem, ...extra });
const clonar = (o) => JSON.parse(JSON.stringify(o));
const listaDe = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));

function exigirMestre() {
    const st = useStore.getState();
    return st.isMestre ? st : null;
}

function feed(texto) { try { enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto }); } catch (e) { /* sem feed */ } }

// Grava a lista inteira (saneada) em cenario.bibliotecaRacial; vazia apaga o nó. Os arrays do cenário são atômicos: sempre a lista toda.
// OPERAÇÕES PENDENTES: o store só reflete uma gravação quando o listener do Firebase responde. Duas operações seguidas no mesmo tick
// (publicar + editar, duas edições, dois "Conceder" ao mesmo personagem) leriam o estado antigo e a segunda apagaria a primeira.
// Por isso guardamos em memória, com expiração curta, a última lista gravada e as concessões ainda não refletidas.
const TTL_PENDENTE_MS = 8000;
let ultimaGravacao = null;            // { lista, ts, cenarioBase } (cenarioBase = referência do cenário do store quando gravamos)
const concessoesPendentes = new Map(); // chave do alvo -> [{ poder, indice, ts }]

// Concessões pendentes do alvo que o store AINDA não reflete (poder com o mesmo id ausente na ficha); as refletidas ou expiradas saem do mapa.
function pendentesDe(chave, fichaDoStore) {
    const ids = new Set(listaDe(fichaDoStore && fichaDoStore.poderes).filter(Boolean).map(p => String(p.id)));
    const agora = Date.now();
    const vivas = (concessoesPendentes.get(chave) || []).filter(x => agora - x.ts < TTL_PENDENTE_MS && !ids.has(String(x.poder.id)));
    if (vivas.length) concessoesPendentes.set(chave, vivas); else concessoesPendentes.delete(chave);
    return vivas;
}
function reservar(chave, { poder, indice }) {
    concessoesPendentes.set(chave, [...(concessoesPendentes.get(chave) || []), { poder, indice, ts: Date.now() }]);
}
// Próximo índice livre em poderes/<n>: 1 + o maior entre as chaves numéricas da lista (array ou objeto esparso) e as reservas pendentes.
function proximoIndice(poderes, pendentes) {
    let maior = -1;
    if (Array.isArray(poderes)) maior = poderes.length - 1;
    else if (poderes && typeof poderes === 'object') Object.keys(poderes).forEach((k) => { const n = Number(k); if (Number.isInteger(n) && n > maior) maior = n; });
    (pendentes || []).forEach((x) => { if (x.indice > maior) maior = x.indice; });
    return maior + 1;
}

// Esquece tudo que estava pendente (testes e troca de mesa).
export function limparPendentesBiblioteca() { ultimaGravacao = null; concessoesPendentes.clear(); }

// Lista-base da biblioteca: a última gravada enquanto o store ainda não mudou desde então (e não expirou); senão a do store.
function baseDaBiblioteca(st) {
    const doStore = getBiblioteca(st.cenario);
    const u = ultimaGravacao;
    if (u && Date.now() - u.ts < TTL_PENDENTE_MS && u.cenarioBase === st.cenario) return u.lista;
    return doStore;
}

// Grava a lista inteira (saneada) em cenario.bibliotecaRacial; vazia apaga o nó. Os arrays do cenário são atômicos: sempre a lista toda.
// Devolve { lista, aviso }: aviso quando a saneada descartou entradas (inválidas, com chave proibida ou grandes demais).
function gravarBiblioteca(st, lista) {
    const limpa = sanitizarBiblioteca(lista);
    const novoCenario = clonar(st.cenario || {});
    if (limpa.length === 0) delete novoCenario.bibliotecaRacial; else novoCenario.bibliotecaRacial = limpa;
    salvarCenarioCompleto(novoCenario);
    ultimaGravacao = { lista: limpa, ts: Date.now(), cenarioBase: st.cenario };
    const descartadas = listaDe(lista).length - limpa.length;
    let aviso = '';
    if (descartadas > 0) {
        aviso = `${descartadas} entrada(s) da biblioteca foram descartadas por serem inválidas ou grandes demais (limite de cerca de 20 KB por habilidade).`;
        feed(`📚 ${aviso}`);
    }
    return { lista: limpa, aviso };
}

const chaveNome = (t) => normalizarNomeRaca(textoBiblioteca(t, LIMITE_NOME_BIBLIOTECA));
const nomeDuplicado = (lista, nome, idIgnorado) => { const n = chaveNome(nome); return !!n && lista.some(e => e.id !== idIgnorado && chaveNome(e.nome) === n); };

// Entrada que já representa este poder (origemBiblioteca igual ao id ou mesmo nome), ou null.
export function entradaExistenteParaPoder(cenario, poder) {
    if (!poder) return null;
    const nome = normalizarNomeRaca(poder.nome);
    const lista = getBiblioteca(cenario);
    return lista.find(e => poder.origemBiblioteca && e.id === poder.origemBiblioteca) || (nome && lista.find(e => normalizarNomeRaca(e.nome) === nome)) || null;
}

// Publica uma Habilidade de Raça existente (poder da ficha) na biblioteca. meta = { nome, resumo, icone, racasAcesso?, percentualMinimo?, requisito?, atualizarId? }.
// Já existe entrada equivalente: recusa com { jaExiste: true, entradaId } a não ser que meta.atualizarId seja esse id (então atualiza o modelo e os dados, preservando id e data).
export function publicarNaBiblioteca(poderDaFicha, meta = {}) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    if (!poderDaFicha || !ehHabilidadeDeRaca(poderDaFicha)) return falha('Só Habilidades de Raça vão para a biblioteca.');
    const atual = baseDaBiblioteca(st);
    const existente = entradaExistenteParaPoder({ bibliotecaRacial: atual }, poderDaFicha);
    const atualizando = existente && meta.atualizarId === existente.id;
    if (existente && !atualizando) return falha(`Já existe "${existente.nome}" na biblioteca. Use "Atualizar a entrada existente".`, { jaExiste: true, entradaId: existente.id });
    const nomeEscolhido = meta.nome != null ? meta.nome : poderDaFicha.nome;
    if (nomeDuplicado(atual, nomeEscolhido, atualizando ? existente.id : null)) return falha(`Já existe outra habilidade chamada "${textoBiblioteca(nomeEscolhido, LIMITE_NOME_BIBLIOTECA)}" na biblioteca. Escolha outro nome.`, { nomeDuplicado: true });
    if (!existente && atual.length >= LIMITE_BIBLIOTECA) return falha(`A biblioteca está cheia (limite de ${LIMITE_BIBLIOTECA} habilidades).`);
    const criado = criarEntradaDePoder(poderDaFicha, {
        nome: meta.nome, resumo: meta.resumo, icone: meta.icone, racasAcesso: meta.racasAcesso, percentualMinimo: meta.percentualMinimo,
        requisito: meta.requisito != null ? meta.requisito : (existente ? existente.requisito : ''),
        criadoPor: st.meuNome || '', existentes: atual.map(e => e.id),
    });
    if (!criado.ok) return falha(criado.mensagem);
    let entrada = criado.entrada;
    if (atualizando) entrada = { ...entrada, id: existente.id, criadoEm: existente.criadoEm, criadoPor: existente.criadoPor || entrada.criadoPor };
    const lista = atualizando ? atual.map(e => (e.id === existente.id ? entrada : e)) : [...atual, entrada];
    const { aviso } = gravarBiblioteca(st, lista);
    return { ok: true, entrada, atualizada: !!atualizando, ...(aviso ? { aviso } : {}) };
}

// Edita dados de uma entrada: patch = { nome, resumo, icone, racasAcesso, percentualMinimo, requisito } (só o que veio). NÃO altera cópias já concedidas.
export function atualizarEntradaDaBiblioteca(id, patch = {}) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const atual = baseDaBiblioteca(st);
    const alvo = atual.find(e => e.id === id);
    if (!alvo) return falha('Entrada não encontrada na biblioteca.');
    const campos = {};
    ['nome', 'resumo', 'icone', 'racasAcesso', 'percentualMinimo', 'requisito'].forEach((k) => { if (patch[k] !== undefined) campos[k] = patch[k]; });
    if (campos.nome !== undefined) {
        // Limite de 60 caracteres ANTES de gravar; nome vazio ou repetido (sem acento/caixa) é recusado.
        campos.nome = textoBiblioteca(campos.nome, LIMITE_NOME_BIBLIOTECA);
        if (!campos.nome) return falha('A entrada precisa de um nome.');
        if (nomeDuplicado(atual, campos.nome, id)) return falha(`Já existe outra habilidade chamada "${campos.nome}" na biblioteca. Escolha outro nome.`, { nomeDuplicado: true });
    }
    const nova = { ...alvo, ...campos };
    const { lista, aviso } = gravarBiblioteca(st, atual.map(e => (e.id === id ? nova : e)));
    return { ok: true, entrada: lista.find(e => e.id === id) || null, ...(aviso ? { aviso } : {}) };
}

// Tira a entrada da biblioteca. Os poderes já concedidos continuam nas fichas.
export function removerDaBiblioteca(id) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const atual = baseDaBiblioteca(st);
    if (!atual.some(e => e.id === id)) return falha('Entrada não encontrada na biblioteca.');
    const { aviso } = gravarBiblioteca(st, atual.filter(e => e.id !== id));
    return { ok: true, ...(aviso ? { aviso } : {}) };
}

// Concede a Habilidade da biblioteca ao personagem. opcoes = { bloqueada, requisito, excecaoConfirmada }.
// Sem Raça com acesso: devolve { ok:false, precisaExcecao:true, mensagem } e só concede quando a tela repete com excecaoConfirmada:true (grava racaExcecao).
// Percentual abaixo do mínimo: concede normalmente e a habilidade fica 🔒 Domínio insuficiente (derivado, nada extra gravado).
export function concederHabilidade(entidade, entradaId, opcoes = {}) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const entrada = baseDaBiblioteca(st).find(e => e.id === entradaId);
    if (!entrada) return falha('Entrada não encontrada na biblioteca.');
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    // Para outro jogador e dummie a ficha do store pode estar atrasada: soma as concessões pendentes (ainda não refletidas) à vista dela.
    const chaveAlvo = alvo.tipo === 'dummie' ? `d:${alvo.id}` : `p:${sanitizarNome(alvo.nome)}`;
    const pendentes = alvo.tipo === 'eu' ? [] : pendentesDe(chaveAlvo, alvo.fresca);
    if (alvo.tipo !== 'eu') alvo.fresca = { ...alvo.fresca, poderes: [...listaDe(alvo.fresca.poderes), ...pendentes.map(x => x.poder)] };
    if (jaPossuiHabilidade(alvo.fresca, entrada)) return falha(`${alvo.nome} já possui "${entrada.nome}".`, { jaPossui: true });
    const acesso = verificarAcessoHabilidadeRaca({
        cenario: st.cenario, ficha: alvo.fresca, isMestre: true,
        poder: { categoria: ID_CATEGORIA_HABILIDADE_RACA, nome: entrada.nome, racasAcesso: entrada.racasAcesso, percentualMinimo: entrada.percentualMinimo },
    });
    const excecao = !acesso.permitido;
    if (excecao && opcoes.excecaoConfirmada !== true) return falha(acesso.mensagem, { precisaExcecao: true });
    // Id estável e único: Date.now(), subindo se já houver poder com esse id na ficha mais fresca.
    const ocupados = new Set(listaDe(alvo.fresca.poderes).filter(Boolean).map(p => String(p.id)));
    let id = Date.now();
    while (ocupados.has(String(id))) id += 1;
    const poder = montarPoderConcedido(entrada, { id, bloqueada: opcoes.bloqueada === true, requisito: opcoes.requisito, racaExcecao: excecao });
    if (alvo.tipo === 'eu') {
        let criou = false;
        st.updateFicha((f) => {
            if (!f) return;
            if (jaPossuiHabilidade(f, entrada)) return;
            if (!Array.isArray(f.poderes)) f.poderes = listaDe(f.poderes);
            f.poderes.push(poder); criou = true;
        });
        if (!criou) return falha(`${alvo.nome} já possui "${entrada.nome}".`, { jaPossui: true });
        salvarFichaSilencioso();
    } else if (alvo.tipo === 'dummie') {
        // alvo.fresca já traz as concessões pendentes; salvarDummie regrava o objeto inteiro, então elas não podem se perder.
        const d = clonar(alvo.fresca);
        d.poderes = listaDe(d.poderes);
        d.poderes.push(poder);
        salvarDummie(alvo.id, d);
        reservar(chaveAlvo, { poder, indice: d.poderes.length - 1 });
    } else {
        // Índice = maior chave numérica de poderes (o Firebase devolve objeto esparso se faltar um índice) + 1, e acima das reservas pendentes.
        const indice = proximoIndice(st.personagens && (st.personagens[alvo.nome] || {}).poderes, pendentes);
        salvarCamposPersonagem(alvo.nome, { [`poderes/${indice}`]: poder });
        reservar(chaveAlvo, { poder, indice });
    }
    feed(`📚 ${alvo.nome} recebeu a Habilidade de Raça ${entrada.nome}`);
    const situacao = disponivelParaFicha(st.cenario, alvo.fresca, entrada);
    return { ok: true, poder, excecao, dominioInsuficiente: situacao.disponivel && !situacao.atingeMinimo };
}

