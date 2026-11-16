import useStore, { sanitizarNome } from '../stores/useStore';
import { salvarFichaSilencioso, salvarDummie, salvarCamposPersonagem, enviarParaFeed } from './firebase-sync';
import {
    getRacas, getComposicaoRacial, ehHabilidadeDeRaca, poderBloqueado, percentualMinimoDoPoder,
    PERCENTUAL_RACA_ADQUIRIDA_PADRAO, LIMITE_HISTORICO_COMPOSICAO, LIMITE_COMPOSICAO_RACIAL, LIMITE_PEDIDOS_RACA,
} from '../core/racas';
import { desligarPoderNoRascunho } from '../core/custoPorTurno';

// 🧬 Composição racial (mestiços, Raça Primordial, Manipulação de DNA), bloqueio de Habilidades de Raça e pedidos de Raça.
// Única cópia da regra (a interface chama estas funções). Não depende do Mapa: lê o store NO MOMENTO da chamada.
// Gravação: na PRÓPRIA ficha = updateFicha + salvarFichaSilencioso (debounce); em outro jogador = salvarCamposPersonagem com caminhos pontuais
// ('bio/composicaoRacial', 'bio/composicaoRacialHistorico', 'bio/pedidosRaca' e 'poderes/<índice>/<campo>', índice resolvido por ID na ficha MAIS FRESCA do store);
// dummie = salvarDummie. Todas devolvem { ok, mensagem?, ...dados } (nunca lançam).
// entidade = { id, nome, isDummie } (mesmo formato de definirRacaDoPersonagemDireto em racasMesa.js).

const MSG_SO_MESTRE = 'Só o Mestre ou Co-Mestre pode fazer isso (e não no Modo Jogador).';
const falha = (mensagem) => ({ ok: false, mensagem });
const limitar = (v, padrao = 0) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return padrao;
    return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
};
const texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const clonar = (o) => JSON.parse(JSON.stringify(o));
const valorNoCaminho = (obj, caminho) => caminho.split('/').reduce((a, k) => (a == null ? undefined : a[k]), obj);

// Resolve a entidade alvo: { tipo: 'eu'|'outro'|'dummie', nome, id, fresca } ou { erro }.
function resolverAlvo(entidade, st) {
    if (!entidade) return { erro: 'Personagem não informado.' };
    if (entidade.isDummie) {
        const d = (st.dummies || {})[entidade.id];
        return d ? { tipo: 'dummie', id: entidade.id, nome: d.nome || entidade.nome || entidade.id, fresca: d } : { erro: 'Dummie não encontrado.' };
    }
    const nome = entidade.id || entidade.nome;
    if (!nome) return { erro: 'Personagem não informado.' };
    if (sanitizarNome(nome) === sanitizarNome(st.meuNome || '')) return { tipo: 'eu', nome: st.meuNome, fresca: st.minhaFicha };
    const pers = st.personagens || {};
    const chave = pers[nome] ? nome : Object.keys(pers).find(k => sanitizarNome(k) === sanitizarNome(nome));
    return chave ? { tipo: 'outro', nome: chave, fresca: pers[chave] } : { erro: 'Ficha do personagem não carregada.' };
}

// Aplica `mutar(ficha)` na ficha do alvo e grava. `mutar` devolve { ok, mensagem?, caminhos?, feed?, ... }:
// caminhos = lista de 'bio/campo' (valor lido do rascunho) ou { poderId, campo } (grava poderes/<índice>/<campo>; ausente = null).
function aplicar(alvo, mutar) {
    const st = useStore.getState();
    if (alvo.tipo === 'eu') {
        let r = null;
        st.updateFicha((f) => { r = mutar(f); });
        if (r && (r.ok || r.descartado)) salvarFichaSilencioso();
        return r || falha('Nada a fazer.');
    }
    if (alvo.tipo === 'dummie') {
        const d = clonar(alvo.fresca);
        const r = mutar(d);
        if (r && (r.ok || r.descartado)) salvarDummie(alvo.id, d);
        return r || falha('Nada a fazer.');
    }
    const f = clonar(alvo.fresca);
    const r = mutar(f);
    if (!r || !(r.ok || r.descartado)) return r || falha('Nada a fazer.');
    const campos = {};
    (r.caminhos || []).forEach((c) => {
        if (typeof c === 'string') { const v = valorNoCaminho(f, c); campos[c] = v === undefined ? null : v; return; }
        const idx = (f.poderes || []).findIndex(p => p && String(p.id) === String(c.poderId));
        if (idx < 0) return;
        const v = f.poderes[idx][c.campo];
        campos[`poderes/${idx}/${c.campo}`] = v === undefined ? null : v;
    });
    if (Object.keys(campos).length) salvarCamposPersonagem(alvo.nome, campos);
    return r;
}

function exigirMestre() {
    const st = useStore.getState();
    return st.isMestre ? st : null;
}

const listaDe = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));

// Composição pronta para gravar (a partir da derivada ou explícita): [{ racaId, percentual, origem, fonte? }].
function composicaoGravavel(cenario, ficha) {
    return getComposicaoRacial(cenario, ficha).map((e) => ({ racaId: e.racaId, percentual: e.percentual, origem: e.origem, ...(e.fonte ? { fonte: e.fonte } : {}) }));
}

function registrarHistorico(f, entrada) {
    if (!f.bio) f.bio = {};
    const lista = listaDe(f.bio.composicaoRacialHistorico).filter(Boolean);
    lista.push({ ts: Date.now(), ...entrada });
    f.bio.composicaoRacialHistorico = lista.slice(-LIMITE_HISTORICO_COMPOSICAO);
}

function feedDNA(texto) { try { enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto }); } catch (e) { /* sem feed */ } }

// Desliga, no rascunho , as Habilidades de Raça LIGADAS que acabaram bloqueadas (percentual/composição/mínimo/raça mudou) e avisa no Feed.
// Na própria ficha/dummie usa desligarPoderNoRascunho (mantém a % dos vitais e remove o escudo); em outro jogador (tipo 'outro') só vira ativa=false.
// Devolve os caminhos { poderId, campo:'ativa' } para gravar. LIMITAÇÃO: efeitos PASSIVOS (efeitosPassivos) continuam somados; as leituras diretas de p.ativa
// (alcance, AcertoFormContext, MapaFormContext, ElementosFormContext) ficam cobertas por esta desligada, porque o poder deixa de estar ativo.
export function desligarHabilidadesBloqueadas(f, cenario, { tipo = 'eu', nome = '' } = {}) {
    const caminhos = [];
    listaDe(f && f.poderes).forEach((p) => {
        if (!p || !p.ativa || !ehHabilidadeDeRaca(p)) return;
        const b = poderBloqueado(cenario, f, p);
        if (!b.bloqueado) return;
        if (tipo === 'outro') p.ativa = false; else desligarPoderNoRascunho(f, p.id);
        caminhos.push({ poderId: p.id, campo: 'ativa' });
        feedDNA(`🔒 ${nome || 'Personagem'}: ${p.nome || 'Habilidade de Raça'} foi desligada (${b.origem === 'percentual' ? 'Domínio insuficiente' : 'bloqueada'})`);
    });
    return caminhos;
}

// Define a composição inteira (Mestre). lista = [{ racaId, percentual, origem?, fonte? }]; ids fora do catálogo e repetidos saem; [] volta à derivada (só a Raça principal a 100%).
export function definirComposicaoRacial(entidade, lista) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    const racas = getRacas(st.cenario);
    const vistos = new Set();
    const limpa = [];
    listaDe(lista).forEach((e) => {
        if (!e || limpa.length >= LIMITE_COMPOSICAO_RACIAL) return;
        const id = typeof e.racaId === 'string' ? e.racaId.trim() : '';
        if (!id || vistos.has(id) || !racas.some(r => r.id === id)) return;
        vistos.add(id);
        const origem = e.origem === 'adquirida' ? 'adquirida' : 'nativa';
        const item = { racaId: id, percentual: limitar(e.percentual, origem === 'adquirida' ? PERCENTUAL_RACA_ADQUIRIDA_PADRAO : 100), origem };
        const fonte = texto(e.fonte, 80);
        if (fonte) item.fonte = fonte;
        limpa.push(item);
    });
    return aplicar(alvo, (f) => {
        if (!f.bio) f.bio = {};
        f.bio.composicaoRacial = limpa;
        const desl = desligarHabilidadesBloqueadas(f, st.cenario, alvo);
        return { ok: true, composicao: limpa, caminhos: ['bio/composicaoRacial', ...desl] };
    });
}

// Prática: soma `delta` pontos ao percentual do personagem numa Raça da composição (clamp 0-100) e registra o histórico. Mestre.
export function concederPraticaRacial(entidade, racaId, delta, motivo = '') {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    const d = typeof delta === 'number' ? delta : parseFloat(delta);
    if (!Number.isFinite(d) || d === 0) return falha('Informe quantos pontos de percentual conceder.');
    const racas = getRacas(st.cenario);
    const raca = racas.find(r => r.id === racaId);
    if (!raca) return falha('Raça não encontrada no catálogo.');
    return aplicar(alvo, (f) => {
        const comp = composicaoGravavel(st.cenario, f);
        const entrada = comp.find(e => e.racaId === racaId);
        if (!entrada) return falha(`${alvo.nome} não tem a Raça ${raca.nome} na composição.`);
        const de = entrada.percentual;
        const para = limitar(de + d);
        if (para === de) return falha(`O percentual de ${raca.nome} já está em ${de}%.`);
        entrada.percentual = para;
        if (!f.bio) f.bio = {};
        f.bio.composicaoRacial = comp;
        registrarHistorico(f, { racaId, de, para, delta: Math.round((para - de) * 100) / 100, motivo: texto(motivo, 200), fonte: 'pratica' });
        feedDNA(`🧬 ${alvo.nome} praticou ${raca.nome}: ${de}% → ${para}%`);
        const desl = desligarHabilidadesBloqueadas(f, st.cenario, alvo);
        return { ok: true, de, para, composicao: comp, caminhos: ['bio/composicaoRacial', 'bio/composicaoRacialHistorico', ...desl] };
    });
}

// Adiciona uma Raça adquirida (DNA) à composição; começa em 10% (padrão). Mestre.
export function adicionarRacaAdquirida(entidade, racaId, percentual = PERCENTUAL_RACA_ADQUIRIDA_PADRAO, fonte = '') {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    const raca = getRacas(st.cenario).find(r => r.id === racaId);
    if (!raca) return falha('Raça não encontrada no catálogo.');
    return aplicar(alvo, (f) => {
        const comp = composicaoGravavel(st.cenario, f);
        if (comp.some(e => e.racaId === racaId)) return falha(`${alvo.nome} já tem a Raça ${raca.nome} na composição.`);
        if (comp.length >= LIMITE_COMPOSICAO_RACIAL) return falha('Composição racial cheia.');
        const p = limitar(percentual, PERCENTUAL_RACA_ADQUIRIDA_PADRAO);
        const novo = { racaId, percentual: p, origem: 'adquirida' };
        const fonteLimpa = texto(fonte, 80);
        if (fonteLimpa) novo.fonte = fonteLimpa;
        comp.push(novo);
        if (!f.bio) f.bio = {};
        f.bio.composicaoRacial = comp;
        registrarHistorico(f, { racaId, de: 0, para: p, delta: p, motivo: fonteLimpa ? `Raça adquirida: ${fonteLimpa}` : 'Raça adquirida', fonte: 'dna' });
        feedDNA(`🧬 ${alvo.nome}: Raça ${raca.nome} adquirida (${p}%)`);
        return { ok: true, percentual: p, composicao: comp, caminhos: ['bio/composicaoRacial', 'bio/composicaoRacialHistorico'] };
    });
}

// Tira uma Raça da composição (Mestre). Composição que ficar vazia volta à derivada (Raça principal a 100%).
export function removerRacaDaComposicao(entidade, racaId) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    return aplicar(alvo, (f) => {
        const comp = composicaoGravavel(st.cenario, f);
        if (!comp.some(e => e.racaId === racaId)) return falha('Esta Raça não está na composição.');
        const nova = comp.filter(e => e.racaId !== racaId);
        if (!f.bio) f.bio = {};
        f.bio.composicaoRacial = nova;
        const desl = desligarHabilidadesBloqueadas(f, st.cenario, alvo);
        return { ok: true, composicao: nova, caminhos: ['bio/composicaoRacial', ...desl] };
    });
}

// Jogador (ou Mestre) pede, na PRÓPRIA ficha, uma Raça nova. Só vale com algum poder marcado manipulaDNA (qualquer categoria).
export function pedirRacaAdquirida(racaId, motivo = '') {
    const st = useStore.getState();
    const ficha = st.minhaFicha;
    if (!st.meuNome || !ficha) return falha('Sem personagem carregado.');
    const raca = getRacas(st.cenario).find(r => r.id === racaId);
    if (!raca) return falha('Raça não encontrada no catálogo.');
    if (!listaDe(ficha.poderes).some(p => p && p.manipulaDNA === true)) {
        return falha('Você precisa de uma habilidade, poder, infinity ou singularidade de Manipulação de DNA (marcada pelo Mestre) para pedir uma nova Raça.');
    }
    if (getComposicaoRacial(st.cenario, ficha).some(e => e.racaId === racaId)) return falha(`Você já tem a Raça ${raca.nome}.`);
    const pedidos = listaDe(ficha.bio && ficha.bio.pedidosRaca).filter(Boolean);
    if (pedidos.some(p => p.racaId === racaId)) return falha(`Já existe um pedido pendente para ${raca.nome}.`);
    if (pedidos.length >= LIMITE_PEDIDOS_RACA) return falha('Muitos pedidos pendentes: aguarde o Mestre.');
    const ts = Date.now();
    const pedido = { id: `pedraca_${ts}_${Math.random().toString(36).slice(2, 7)}`, racaId, motivo: texto(motivo, 300), ts };
    st.updateFicha((f) => {
        if (!f.bio) f.bio = {};
        f.bio.pedidosRaca = [...listaDe(f.bio.pedidosRaca).filter(Boolean), pedido];
    });
    salvarFichaSilencioso();
    feedDNA(`🧬 ${st.meuNome} pediu a Raça ${raca.nome} (Manipulação de DNA)`);
    return { ok: true, pedido };
}

// Mestre aprova um pedido: adiciona a Raça adquirida (percentual padrão 10, editável) e tira o pedido.
export function aprovarPedidoRaca(entidade, pedidoId, percentual = PERCENTUAL_RACA_ADQUIRIDA_PADRAO) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    const pedido = listaDe(alvo.fresca.bio && alvo.fresca.bio.pedidosRaca).find(p => p && p.id === pedidoId);
    if (!pedido) return falha('Pedido não encontrado (talvez já resolvido).');
    // Pedido forjado: o dono não tem poder de Manipulação de DNA. Recusar continua possível; o Mestre ainda pode adicionar a Raça pelo editor de composição.
    if (!listaDe(alvo.fresca.poderes).some(p => p && p.manipulaDNA === true)) return falha(`${alvo.nome} não tem nenhum poder de Manipulação de DNA: o pedido não pode ser aprovado (recuse ou adicione a Raça pelo editor de composição).`);
    const raca = getRacas(st.cenario).find(r => r.id === pedido.racaId);
    return aplicar(alvo, (f) => {
        const restantes = listaDe(f.bio && f.bio.pedidosRaca).filter(p => p && p.id !== pedidoId);
        if (!f.bio) f.bio = {};
        f.bio.pedidosRaca = restantes;
        const caminhos = ['bio/pedidosRaca'];
        if (!raca) return { ok: false, mensagem: 'A Raça do pedido não existe mais no catálogo; o pedido foi descartado.', caminhos, descartado: true };
        const comp = composicaoGravavel(st.cenario, f);
        if (comp.some(e => e.racaId === raca.id)) return { ok: false, mensagem: `${alvo.nome} já tem a Raça ${raca.nome}; o pedido foi descartado.`, caminhos, descartado: true };
        const p = limitar(percentual, PERCENTUAL_RACA_ADQUIRIDA_PADRAO);
        comp.push({ racaId: raca.id, percentual: p, origem: 'adquirida', fonte: 'Pedido aprovado' });
        f.bio.composicaoRacial = comp;
        registrarHistorico(f, { racaId: raca.id, de: 0, para: p, delta: p, motivo: pedido.motivo || 'Pedido aprovado', fonte: 'dna' });
        feedDNA(`🧬 ${alvo.nome}: Raça ${raca.nome} adquirida (${p}%)`);
        return { ok: true, percentual: p, composicao: comp, caminhos: [...caminhos, 'bio/composicaoRacial', 'bio/composicaoRacialHistorico'] };
    });
}

// Mestre recusa (descarta) um pedido.
export function recusarPedidoRaca(entidade, pedidoId) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    if (!listaDe(alvo.fresca.bio && alvo.fresca.bio.pedidosRaca).some(p => p && p.id === pedidoId)) return falha('Pedido não encontrado (talvez já resolvido).');
    return aplicar(alvo, (f) => {
        f.bio.pedidosRaca = listaDe(f.bio.pedidosRaca).filter(p => p && p.id !== pedidoId);
        return { ok: true, caminhos: ['bio/pedidosRaca'] };
    });
}

function acharHabilidadeRaca(f, poderId) {
    const p = listaDe(f.poderes).find(x => x && String(x.id) === String(poderId));
    if (!p) return { erro: 'Poder não encontrado na ficha.' };
    if (!ehHabilidadeDeRaca(p)) return { erro: 'Só Habilidades de Raça podem ser bloqueadas ou ter percentual mínimo.' };
    return { poder: p };
}

// Bloqueia/desbloqueia manualmente uma Habilidade de Raça: bloqueio = { ativo, requisito, motivo }. Bloquear uma habilidade ligada também a desliga. Mestre.
export function definirBloqueioDoPoder(entidade, poderId, bloqueio) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    const b = bloqueio && typeof bloqueio === 'object' ? bloqueio : {};
    const novo = { ativo: b.ativo === true, requisito: texto(b.requisito, 300), motivo: texto(b.motivo, 300) };
    return aplicar(alvo, (f) => {
        const { poder, erro } = acharHabilidadeRaca(f, poderId);
        if (erro) return falha(erro);
        const caminhos = [];
        if (!novo.ativo && !novo.requisito && !novo.motivo) delete poder.bloqueio; else poder.bloqueio = novo;
        caminhos.push({ poderId, campo: 'bloqueio' });
        if (novo.ativo && poder.ativa) {
            // Ligada e agora bloqueada: desliga (na própria ficha/dummie com a rotina que mantém a % dos vitais e remove o escudo; em outro jogador só o interruptor).
            if (alvo.tipo === 'outro') poder.ativa = false; else desligarPoderNoRascunho(f, poder.id);
            caminhos.push({ poderId, campo: 'ativa' });
        }
        return { ok: true, bloqueio: poder.bloqueio || null, caminhos };
    });
}

// "Despertar": desbloqueia a Habilidade de Raça bloqueada manualmente (grava ativo:false e a data) e avisa no Feed. Mestre.
// Habilidade bloqueada só por percentual (Domínio) não é despertada: o percentual sobe pela prática (ou o Mestre concede a exceção).
export function despertarHabilidade(entidade, poderId) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    return aplicar(alvo, (f) => {
        const { poder, erro } = acharHabilidadeRaca(f, poderId);
        if (erro) return falha(erro);
        if (!poder.bloqueio || poder.bloqueio.ativo !== true) {
            const b = poderBloqueado(st.cenario, f, poder);
            return falha(b.bloqueado ? 'Esta habilidade está bloqueada por Domínio (percentual da Raça): pratique para elevar o percentual.' : 'Esta habilidade não está bloqueada.');
        }
        poder.bloqueio = { ...poder.bloqueio, ativo: false, despertouEm: Date.now() };
        feedDNA(`🧬 ${alvo.nome} despertou ${poder.nome || 'uma Habilidade de Raça'}`);
        return { ok: true, caminhos: [{ poderId, campo: 'bloqueio' }] };
    });
}

// Percentual mínimo (0-100) para usar a Habilidade de Raça; 0 remove o campo. Mestre.
export function definirPercentualMinimoDoPoder(entidade, poderId, valor) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    const v = percentualMinimoDoPoder({ percentualMinimo: valor });
    return aplicar(alvo, (f) => {
        const { poder, erro } = acharHabilidadeRaca(f, poderId);
        if (erro) return falha(erro);
        if (v > 0) poder.percentualMinimo = v; else delete poder.percentualMinimo;
        const desl = desligarHabilidadesBloqueadas(f, st.cenario, alvo);
        return { ok: true, percentualMinimo: v, caminhos: [{ poderId, campo: 'percentualMinimo' }, ...desl] };
    });
}

// Marca/desmarca um poder (qualquer categoria) como Manipulação de DNA: libera ao dono PEDIR Raças novas. Mestre.
export function definirManipulaDNA(entidade, poderId, valor) {
    const st = exigirMestre();
    if (!st) return falha(MSG_SO_MESTRE);
    const alvo = resolverAlvo(entidade, st);
    if (alvo.erro) return falha(alvo.erro);
    return aplicar(alvo, (f) => {
        const poder = listaDe(f.poderes).find(x => x && String(x.id) === String(poderId));
        if (!poder) return falha('Poder não encontrado na ficha.');
        if (valor === true) poder.manipulaDNA = true; else delete poder.manipulaDNA;
        return { ok: true, manipulaDNA: valor === true, caminhos: [{ poderId, campo: 'manipulaDNA' }] };
    });
}
