// ==========================================
// 🔔 GATILHOS — lógica pura. Um gatilho é DADO (poder.gatilhos[], também em formas, itens equipados e passivas):
//   { id, nome, notas?, passivo?, mestreDesligou?, evento: { tipo, de?, ate? }, condicoes: [], limite?: { max, por },
//     modo: 'automatico' | 'opcional', armado?, prioridade, fase, acoes: [ { tipo, ...params } ] }
// Fase 1 (só o modo automático; 'opcional' fica no modelo mas NÃO dispara ainda):
//   eventos: danoQueZeraria (fase 'antes': o dano final, já depois de Reduções e escudo, levaria a Vida a 0) e
//            vidaAbaixoDe {de, ate} (fase 'depois': a Vida terminou dentro da faixa [ate, de] % da Vida máxima BRUTA, vindo de fora dela).
//   ações:   anularDano, definirVida, curar, escudo, buff, limparCondicoes, imunidadeTotal, mensagem.
// Faixas de Vida: o percentual é arredondado PARA BAIXO ao inteiro antes de comparar (6,9% conta como 6); a faixa é inclusiva nas duas pontas.
// Um golpe que cruza várias faixas só dispara a faixa onde a Vida TERMINA (as outras não contêm a Vida final) e só na borda (entrando de fora).
// Limites: 'cena' | 'descanso' (core/usosPoder.js). O período 'turno' NÃO existe nesta fase (gatilho com ele é descartado).
// Idempotência: ficha.combate.gatilhos[chave].ultimoEvento === eventoId bloqueia o mesmo evento aplicado duas vezes.
// No evento danoQueZeraria, 'definirVida' JÁ ANULA o golpe (o dano restante não é aplicado depois); 'curar' cura ANTES do dano e, se ainda zerar, não salva.
// 'anularDano' só existe em danoQueZeraria (em vidaAbaixoDe o gatilho é descartado).
// Imunidade total de N turnos vale do disparo até o início do N-ésimo turno seguinte do dono (1 = até o início do próximo turno dele); o fim do combate também a encerra.
// Aqui NADA muta a ficha: avaliarGatilhos só decide; quem aplica é core/gatilhosAplicar.js.
// ==========================================
import { passaQuando, montarContextoDeCombate, normalizarQuando } from './efeitosCondicionais.js';
import { efeitosDaConfigAtiva, efeitosAtivosLigados } from './efeitosItem.js';
import { normalizarUsos, usosRestantes } from './usosPoder.js';
import { FATOR_EXIBICAO_VITAIS } from './vitals.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';

export const PROFUNDIDADE_MAX_GATILHOS = 3;
export const LIMITE_GATILHOS_POR_FONTE = 8;
export const LIMITE_ACOES_POR_GATILHO = 6;
export const LIMITE_VALOR_GATILHO = 1e15;
export const LIMITE_TURNOS_IMUNIDADE = 10;
export const LIMITE_DURACAO_BUFF_GATILHO = 20;

export const EVENTOS_GATILHO = [
    { id: 'danoQueZeraria', fase: 'antes', rotulo: 'Quando um golpe me levaria a 0 de vida' },
    { id: 'vidaAbaixoDe', fase: 'depois', rotulo: 'Quando a Vida cair para entre X% e Y%' },
];
export const ACOES_GATILHO = [
    { id: 'anularDano', rotulo: 'Anular o dano' },
    { id: 'definirVida', rotulo: 'Ficar com N de vida' },
    { id: 'curar', rotulo: 'Curar' },
    { id: 'escudo', rotulo: 'Ganhar escudo' },
    { id: 'buff', rotulo: 'Ganhar buff' },
    { id: 'limparCondicoes', rotulo: 'Limpar condições' },
    { id: 'imunidadeTotal', rotulo: 'Imunidade total por N turnos' },
    { id: 'mensagem', rotulo: 'Mensagem no feed' },
];
export const PERIODOS_GATILHO = [
    { id: 'cena', rotulo: 'por cena' },
    { id: 'descanso', rotulo: 'por descanso' },
];
export const MODOS_GATILHO = ['automatico', 'opcional'];
export const MODOS_CURA = ['fixo', 'percMax', 'percAtual'];

const ID_EVENTO = new Set(EVENTOS_GATILHO.map(e => e.id));
const ID_ACAO = new Set(ACOES_GATILHO.map(a => a.id));
const ID_PERIODO = new Set(PERIODOS_GATILHO.map(p => p.id));
const TIPOS_ESCUDO_OK = ['escudo', 'vidaTemporaria'];
const MODOS_BUFF = ['turnos', 'combate', 'permanente'];

const numero = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};
const limitar = (n, min, max) => Math.max(min, Math.min(max, n));
const texto = (v, max) => String(v ?? '').trim().slice(0, max);

// ---------- 🧹 Normalização ----------

// Ação limpa ou null (desconhecida ou com valor inválido). Nenhum campo `undefined`.
export function normalizarAcaoGatilho(bruta) {
    if (!bruta || typeof bruta !== 'object' || !ID_ACAO.has(bruta.tipo)) return null;
    switch (bruta.tipo) {
        case 'anularDano': return { tipo: 'anularDano' };
        case 'limparCondicoes': return { tipo: 'limparCondicoes' };
        case 'definirVida': {
            const valor = numero(bruta.valor);
            if (valor !== null && bruta.valor !== '' && bruta.valor !== null) return { tipo: 'definirVida', valor: limitar(valor, 0, LIMITE_VALOR_GATILHO) };
            const perc = numero(bruta.percMax);
            if (perc !== null && bruta.percMax !== '' && bruta.percMax !== null) return { tipo: 'definirVida', percMax: limitar(perc, 0, 100) };
            return null;
        }
        case 'curar': {
            const modo = MODOS_CURA.includes(bruta.modo) ? bruta.modo : 'fixo';
            const valor = numero(bruta.valor);
            if (valor === null || valor <= 0) return null;
            return { tipo: 'curar', modo, valor: limitar(valor, 0, modo === 'fixo' ? LIMITE_VALOR_GATILHO : (modo === 'percMax' ? 100 : 1000)) };
        }
        case 'escudo': {
            const valor = numero(bruta.valor);
            if (valor === null || valor <= 0) return null;
            return { tipo: 'escudo', nome: texto(bruta.nome, 40) || 'Escudo', valor: Math.floor(limitar(valor, 0, LIMITE_VALOR_GATILHO)), tipoEscudo: TIPOS_ESCUDO_OK.includes(bruta.tipoEscudo) ? bruta.tipoEscudo : 'escudo' };
        }
        case 'buff': {
            const atributo = texto(bruta.atributo, 40);
            const valor = numero(bruta.valor);
            if (!atributo || valor === null) return null;
            const modo = MODOS_BUFF.includes(bruta.modo) ? bruta.modo : 'turnos';
            return { tipo: 'buff', atributo, valor: limitar(valor, -1e9, 1e9), duracao: Math.floor(limitar(numero(bruta.duracao) ?? 3, 1, LIMITE_DURACAO_BUFF_GATILHO)), modo };
        }
        case 'imunidadeTotal': {
            const n = numero(bruta.duracaoTurnos);
            return { tipo: 'imunidadeTotal', duracaoTurnos: Math.floor(limitar(n === null ? 1 : n, 1, LIMITE_TURNOS_IMUNIDADE)) };
        }
        case 'mensagem': {
            const t = texto(bruta.texto, 300);
            return t ? { tipo: 'mensagem', texto: t } : null;
        }
        default: return null;
    }
}

// Condição ('vida_maior_que:N' | 'vida_menor_que:N' | vocabulário do `quando`) em forma canônica; '' = sempre (sai da lista); null = inválida.
export function normalizarCondicaoGatilho(bruta) {
    const s = String(bruta ?? '').trim();
    if (!s) return '';
    const m = /^(vida_maior_que|vida_menor_que)\s*:\s*(.+)$/i.exec(s);
    if (m) {
        const n = numero(m[2]);
        return n !== null && n >= 0 && n <= LIMITE_VALOR_GATILHO ? `${m[1].toLowerCase()}:${n}` : null;
    }
    return normalizarQuando(s);
}

function normalizarEvento(bruto) {
    if (!bruto || typeof bruto !== 'object' || !ID_EVENTO.has(bruto.tipo)) return null;
    if (bruto.tipo === 'danoQueZeraria') return { tipo: 'danoQueZeraria' };
    let de = numero(bruto.de); let ate = numero(bruto.ate);
    if (de === null && ate === null) return null;
    if (de === null) de = ate;
    if (ate === null) ate = de;
    de = Math.floor(limitar(de, 0, 100)); ate = Math.floor(limitar(ate, 0, 100));
    if (ate > de) [de, ate] = [ate, de];
    return { tipo: 'vidaAbaixoDe', de, ate };
}

// { gatilhos, descartados: [{ nome, motivo }] }. Descarta o gatilho inteiro se o evento, uma ação, a condição ou o período forem inválidos
// (nunca "meio gatilho": tirar uma ação mudaria a regra). Trunca em 8 gatilhos e 6 ações; ids únicos; sem `undefined`.
export function normalizarGatilhos(lista, { persistir = true } = {}) {
    const gatilhos = []; const descartados = [];
    const usados = new Set();
    (Array.isArray(lista) ? lista : []).forEach((g, indice) => {
        const nome = texto(g && g.nome, 60) || 'Gatilho';
        if (!g || typeof g !== 'object') { descartados.push({ nome, motivo: 'não é um gatilho' }); return; }
        if (gatilhos.length >= LIMITE_GATILHOS_POR_FONTE) { descartados.push({ nome, motivo: `mais de ${LIMITE_GATILHOS_POR_FONTE} gatilhos` }); return; }
        const evento = normalizarEvento(g.evento);
        if (!evento) { descartados.push({ nome, motivo: 'evento desconhecido' }); return; }
        if (evento.tipo !== 'danoQueZeraria' && Array.isArray(g.acoes) && g.acoes.some(a => a && a.tipo === 'anularDano')) { descartados.push({ nome, motivo: "'anular o dano' só vale em 'golpe me levaria a 0'" }); return; }
        const acoesBrutas = Array.isArray(g.acoes) ? g.acoes.slice(0, LIMITE_ACOES_POR_GATILHO) : [];
        const acoes = acoesBrutas.map(normalizarAcaoGatilho);
        if (acoes.length === 0 || acoes.some(a => !a)) { descartados.push({ nome, motivo: acoes.length === 0 ? 'sem ações' : 'ação desconhecida ou inválida' }); return; }
        const condicoes = [];
        for (const c of (Array.isArray(g.condicoes) ? g.condicoes : [])) {
            const n = normalizarCondicaoGatilho(c);
            if (n === null) { descartados.push({ nome, motivo: `condição inválida: ${texto(c, 40)}` }); return; }
            if (n) condicoes.push(n);
        }
        let limite = null;
        if (g.limite && typeof g.limite === 'object' && numero(g.limite.max) !== null && numero(g.limite.max) > 0) {
            if (!ID_PERIODO.has(g.limite.por)) { descartados.push({ nome, motivo: `período de limite não suportado: ${texto(g.limite.por, 20) || 'vazio'}` }); return; }
            limite = normalizarUsos(g.limite.max, g.limite.por);
        }
        let id = texto(g.id, 40).replace(/[.#$[\]/]/g, '_');
        if (!id || usados.has(id)) {
            // Id novo e ESTÁVEL depois de salvo (o editor persiste); na leitura (persistir:false) é determinístico para não mudar a cada chamada.
            if (persistir) { do { id = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; } while (usados.has(id)); }
            else { let n = indice + 1; while (usados.has(`g${n}`)) n++; id = `g${n}`; }
        }
        usados.add(id);
        const saida = {
            id, nome, evento,
            fase: ID_EVENTO.has(evento.tipo) ? EVENTOS_GATILHO.find(e => e.id === evento.tipo).fase : 'depois',
            condicoes, modo: MODOS_GATILHO.includes(g.modo) ? g.modo : 'automatico',
            prioridade: Math.floor(limitar(numero(g.prioridade) ?? 0, -100, 100)),
            acoes,
        };
        const notas = texto(g.notas, 300);
        if (notas) saida.notas = notas;
        if (limite) saida.limite = limite;
        if (g.armado === true || g.armado === false) saida.armado = g.armado;
        if (g.passivo === true) saida.passivo = true;
        if (g.mestreDesligou === true) saida.mestreDesligou = true;
        gatilhos.push(saida);
    });
    return { gatilhos, descartados };
}

// ---------- 📚 Coleta (mesmos funis dos efeitos ativos) ----------

// Gatilhos da Forma ativa e da Configuração ativa de uma entidade (Poder ou Item), como em efeitosDaConfigAtiva.
function listasDaForma(entidade) {
    const listas = [];
    if (!entidade || !entidade.formaAtivaId || !Array.isArray(entidade.formas)) return listas;
    const forma = entidade.formas.find(f => f && f.id === entidade.formaAtivaId);
    if (!forma) return listas;
    if (Array.isArray(forma.gatilhos)) listas.push({ lista: forma.gatilhos, sufixo: `forma:${forma.id}` });
    const cfg = efeitosDaConfigAtiva(entidade) && (Array.isArray(forma.configs) ? forma.configs.filter(Boolean) : []);
    if (cfg && cfg.length) {
        const ativa = (entidade.configAtivaId && cfg.find(c => c.id === entidade.configAtivaId)) || cfg[0];
        if (ativa && Array.isArray(ativa.gatilhos)) listas.push({ lista: ativa.gatilhos, sufixo: `forma:${forma.id}:cfg:${ativa.id}` });
    }
    return listas;
}

const chaveSegura = (s) => String(s).replace(/[.#$[\]/]/g, '_');

// Todos os gatilhos que valem agora na ficha: Poder ligado (ou gatilho `passivo`), Forma/Configuração ativa, Item equipado
// (efeitos ativos ligados, ou `passivo`) e Passivas. Cada um: { gatilho, fonte: { tipo, id, nome }, chave }.
// `chave` (sem caracteres proibidos no Firebase) identifica o gatilho em usosPoderes e combate.gatilhos e distingue a fonte
// (poder = "<id>:<gatilho>"; forma/config = "<id>:forma:<forma>[:cfg:<cfg>]:<gatilho>"; item = "item_<id>:..."; passiva = "passiva_<id>:...").
export function coletarGatilhos(ficha) {
    const saida = [];
    if (!ficha || typeof ficha !== 'object') return saida;
    const juntar = (lista, fonte, prefixo, sufixo, ligada) => {
        if (!Array.isArray(lista) || lista.length === 0) return;
        normalizarGatilhos(lista, { persistir: false }).gatilhos.forEach((g) => {
            if (g.mestreDesligou) return;
            if (!ligada && !g.passivo) return;
            saida.push({ gatilho: g, fonte, chave: chaveSegura(`${prefixo}${fonte.id}:${sufixo ? sufixo + ':' : ''}${g.id}`) });
        });
    };
    (ficha.poderes || []).forEach((p) => {
        if (!p || typeof p !== 'object') return;
        const fonte = { tipo: 'poder', id: String(p.id), nome: String(p.nome || 'Poder') };
        juntar(p.gatilhos, fonte, '', '', !!p.ativa);
        listasDaForma(p).forEach(({ lista, sufixo }) => juntar(lista, fonte, '', sufixo, !!p.ativa));
    });
    (ficha.inventario || []).forEach((i) => {
        if (!i || typeof i !== 'object' || !i.equipado) return;
        const fonte = { tipo: 'item', id: String(i.id), nome: String(i.nome || 'Item') };
        juntar(i.gatilhos, fonte, 'item_', '', efeitosAtivosLigados(i));
        listasDaForma(i).forEach(({ lista, sufixo }) => juntar(lista, fonte, 'item_', sufixo, efeitosAtivosLigados(i)));
    });
    (ficha.passivas || []).forEach((p) => {
        if (!p || typeof p !== 'object') return;
        juntar(p.gatilhos, { tipo: 'passiva', id: String(p.id), nome: String(p.nome || 'Passiva') }, 'passiva_', '', true);
    });
    return saida;
}

export const temGatilhos = (ficha) => coletarGatilhos(ficha).length > 0;

// ---------- ❓ Condições ----------

// Vida em unidades EXIBIDAS (a da tela) a partir da bruta.
export const vidaExibida = (bruta) => (Number(bruta) || 0) / FATOR_EXIBICAO_VITAIS;

function condicaoPassa(condicao, ficha, vidaBruta, ctxCombate) {
    const m = /^(vida_maior_que|vida_menor_que):(.+)$/.exec(condicao);
    if (m) {
        const n = parseFloat(m[2]);
        const v = vidaExibida(vidaBruta);
        return m[1] === 'vida_maior_que' ? v > n : v < n;
    }
    return passaQuando({ quando: condicao }, ctxCombate);
}

// ---------- 🧮 Faixas ----------

export const percentualDaVida = (vidaBruta, vidaMaxBruta) => {
    const max = Number(vidaMaxBruta);
    if (!(max > 0)) return NaN;
    return Math.max(0, (Number(vidaBruta) || 0) / max * 100);
};
const dentroDaFaixa = (pct, de, ate) => Number.isFinite(pct) && Math.floor(pct + 1e-9) >= ate && Math.floor(pct + 1e-9) <= de;

// ---------- 🎯 Avaliação ----------

// avaliarGatilhos({ tipo }, contexto, ficha, opcoes) -> { acoes, bloqueados, textos, disparados }.
//   contexto: { vidaAntes, vidaDepois, vidaMaxBruta?, eventoId?, cenaId?, profundidade?, jaDisparados? } (Vida em escala BRUTA)
//     danoQueZeraria: vidaAntes e vidaDepois = a Vida antes e a que ficaria sem o gatilho (vidaDepois <= 0 dispara; vidaAntes precisa ser > 0)
//     vidaAbaixoDe:   vidaAntes e vidaDepois = a Vida antes e depois do dano
//   opcoes: { coletados } (lista já coletada) | { contextoCombate }
// `acoes` vem na ordem (prioridade desc., depois a ordem da lista) com { gatilhoId, gatilhoNome, chave, fonte, ...ação }.
// `disparados`: [{ chave, gatilho, fonte }]. `bloqueados`: [{ chave, nome, motivo }]. Não muta nada.
export function avaliarGatilhos(evento, contexto = {}, ficha = null, opcoes = {}) {
    const resultado = { acoes: [], bloqueados: [], textos: [], disparados: [] };
    if (!evento || !ID_EVENTO.has(evento.tipo) || !ficha) return resultado;
    const profundidade = Number(contexto.profundidade) || 0;
    const ja = new Set(Array.isArray(contexto.jaDisparados) ? contexto.jaDisparados : (contexto.jaDisparados ? [...contexto.jaDisparados] : []));
    const coletados = (opcoes.coletados || coletarGatilhos(ficha)).filter(c => c.gatilho.evento.tipo === evento.tipo);
    if (coletados.length === 0) return resultado;
    const ctxCombate = opcoes.contextoCombate || montarContextoDeCombate(ficha);
    const vidaMax = Number(contexto.vidaMaxBruta) > 0 ? Number(contexto.vidaMaxBruta) : getVidaMaxBrutaNpc(ficha);
    const registros = (ficha.combate && ficha.combate.gatilhos) || {};
    const cena = String(contexto.cenaId ?? 'default');
    const ordenados = coletados.map((c, i) => ({ c, i })).sort((a, b) => (b.c.gatilho.prioridade - a.c.gatilho.prioridade) || (a.i - b.i)).map(x => x.c);

    ordenados.forEach(({ gatilho: g, fonte, chave }) => {
        const bloquear = (motivo) => resultado.bloqueados.push({ chave, nome: g.nome, motivo });
        if (g.modo !== 'automatico') return bloquear('modo opcional ainda não é executado');
        if (profundidade >= PROFUNDIDADE_MAX_GATILHOS) return bloquear('profundidade máxima');
        if (ja.has(chave)) return bloquear('já disparou nesta cadeia');
        if (contexto.eventoId && registros[chave] && registros[chave].ultimoEvento === contexto.eventoId) return bloquear('evento já tratado');
        if (g.limite && !(usosRestantes(ficha, { id: chave, usosMax: g.limite.max, usosPor: g.limite.por }, cena) > 0)) return bloquear('sem usos');

        const antes = Number(contexto.vidaAntes) || 0; const depois = Number(contexto.vidaDepois) || 0;
        if (g.evento.tipo === 'danoQueZeraria') {
            if (!(antes > 0 && depois <= 0)) return;
        } else {
            const pctDepois = percentualDaVida(depois, vidaMax);
            const pctAntes = percentualDaVida(antes, vidaMax);
            if (!(depois < antes) || !dentroDaFaixa(pctDepois, g.evento.de, g.evento.ate) || dentroDaFaixa(pctAntes, g.evento.de, g.evento.ate)) return;
        }
        const vidaDaCondicao = g.fase === 'antes' ? antes : depois;
        if (!g.condicoes.every(c => condicaoPassa(c, ficha, vidaDaCondicao, ctxCombate))) return bloquear('condição não atendida');

        ja.add(chave);
        resultado.disparados.push({ chave, gatilho: g, fonte });
        resultado.textos.push(`🔔 ${g.nome} disparou`);
        g.acoes.forEach(a => resultado.acoes.push({ ...a, gatilhoId: g.id, gatilhoNome: g.nome, fase: g.fase, chave, fonte }));
    });
    return resultado;
}

// ---------- 💬 Frase legível (cartão do Poder, editor) ----------

const fmtN = (n) => Math.floor(Number(n) || 0).toLocaleString('pt-BR');

export function descreverAcaoGatilho(a) {
    if (!a) return '';
    switch (a.tipo) {
        case 'anularDano': return 'anular o dano';
        case 'definirVida': return a.valor !== undefined ? `ficar com ${fmtN(a.valor)} de vida` : `ficar com ${a.percMax}% da Vida máxima`;
        case 'curar': return a.modo === 'fixo' ? `curar ${fmtN(a.valor)}` : `curar ${a.valor}% da Vida ${a.modo === 'percMax' ? 'máxima' : 'atual'}`;
        case 'escudo': return `ganhar ${a.tipoEscudo === 'vidaTemporaria' ? 'vida temporária' : 'escudo'} de ${fmtN(a.valor)}`;
        case 'buff': return `ganhar ${a.valor >= 0 ? '+' : ''}${a.valor} em ${a.atributo}${a.modo === 'turnos' ? ` por ${a.duracao} turno(s)` : a.modo === 'combate' ? ' até o fim do combate' : ''}`;
        case 'limparCondicoes': return 'limpar as condições';
        case 'imunidadeTotal': return `ficar imune a todo dano por ${a.duracaoTurnos} turno(s)`;
        case 'mensagem': return `avisar: "${a.texto}"`;
        default: return '';
    }
}

export function descreverGatilho(g) {
    if (!g || !g.evento) return '';
    const quando = g.evento.tipo === 'danoQueZeraria'
        ? 'Quando um golpe me levaria a 0'
        : (g.evento.de === g.evento.ate ? `Quando a Vida cair para ${g.evento.de}%` : `Quando a Vida cair para entre ${g.evento.de}% e ${g.evento.ate}%`);
    const cond = (g.condicoes || []).map((c) => {
        const m = /^(vida_maior_que|vida_menor_que):(.+)$/.exec(c);
        return m ? `Vida ${m[1] === 'vida_maior_que' ? 'maior' : 'menor'} que ${m[2]}` : c;
    });
    const lim = g.limite ? ` (${g.limite.max}x ${(PERIODOS_GATILHO.find(p => p.id === g.limite.por) || { rotulo: g.limite.por }).rotulo})` : '';
    // Em 'golpe me levaria a 0', ficar com N de vida já anula o golpe.
    const frases = (g.acoes || []).map(a => descreverAcaoGatilho(a) + (g.evento.tipo === 'danoQueZeraria' && a.tipo === 'definirVida' ? ' (já anula o golpe)' : ''));
    return `${quando}${cond.length ? ` e ${cond.join(', ')}` : ''}: ${frases.join(', ')}${lim}`;
}
