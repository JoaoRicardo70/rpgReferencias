// ==========================================
// 🔔 APLICAR AÇÕES DE GATILHOS — lógica pura sobre o RASCUNHO da ficha (Immer) ou um clone solto.
// Quem decide QUAIS ações valem é core/gatilhos.js > avaliarGatilhos; aqui elas são executadas e viram frases do feed.
// Devolve { textos, anulado, caminhos }: `caminhos` = campos tocados (formato do Firebase: 'vida/atual', 'escudos'...), para quem grava
// numa ficha de OUTRO jogador mandar só eles (services/danoAlvo.js). Nada fica `undefined`: o que some vira delete na ficha e null no Firebase.
// ==========================================
import { FATOR_EXIBICAO_VITAIS, VITAIS_REGENERAVEIS } from './vitals.js';
import { coletarGatilhos, avaliarGatilhos, PROFUNDIDADE_MAX_GATILHOS } from './gatilhos.js';
import { atualizarContador, resetarContadoresDeCena } from './contadores.js';
import { aplicarEstadoNaFicha, tirarEstado, nomeDoEstado } from './condicoes.js';
import { imuneAoEstado } from './efeitosCondicionais.js';
import { ligarPoderNoRascunho, desligarPoderNoRascunho } from './custoPorTurno.js';
import { aplicarDanoNaVida } from './danoVida.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';
import { calcularEficaciaCura } from './engine.js';
import { adicionarEscudo, removerEscudo } from './escudos.js';
import { gastarUso } from './usosPoder.js';
import { somarBuffTemporario } from './suporte.js';

const fmtN = (n) => Math.floor(Number(n) || 0).toLocaleString('pt-BR');

// God Mode: enquanto ficha.combate.imunidadeTotal.turnosRestantes > 0, TODO dano à Vida vira 0 (inclusive Dano Verdadeiro).
export function temImunidadeTotal(ficha) {
    const im = ficha && ficha.combate && ficha.combate.imunidadeTotal;
    return !!im && Number(im.turnosRestantes) > 0;
}

// Início do turno do dono: perde 1 turno; ao chegar a 0 a chave some. Devolve { mudou, texto }.
export function passarTurnoDaImunidadeTotal(ficha) {
    const im = ficha && ficha.combate && ficha.combate.imunidadeTotal;
    if (!im) return { mudou: false, texto: '' };
    const restantes = Math.floor(Number(im.turnosRestantes) || 0) - 1;
    if (restantes > 0) { ficha.combate.imunidadeTotal = { ...im, turnosRestantes: restantes }; return { mudou: true, texto: '' }; }
    delete ficha.combate.imunidadeTotal;
    return { mudou: true, texto: `${im.origem || 'Gatilho'}: a Imunidade total terminou` };
}

// 'NdM' -> soma dos dados (rng injetável para teste).
export function rolarSorteio(sorteio, rng = Math.random) {
    const m = /^(\d+)d(\d+)$/i.exec(String(sorteio || ''));
    if (!m) return 0;
    let total = 0;
    for (let i = 0; i < Number(m[1]); i++) total += Math.floor(rng() * Number(m[2])) + 1;
    return total;
}

// Limite 'turno': zera os usos por turno do dono (início do turno dele ou fim da luta). Devolve true se mudou algo.
export function zerarUsosPorTurno(ficha) {
    const usos = ficha && ficha.combate && ficha.combate.usosPoderes;
    if (!usos || typeof usos !== 'object') return false;
    let mudou = false;
    Object.keys(usos).forEach((k) => { if (usos[k] && usos[k].turno === true) { delete usos[k]; mudou = true; } });
    if (mudou && Object.keys(usos).length === 0) delete ficha.combate.usosPoderes;
    return mudou;
}

// Registra no rascunho que estes gatilhos dispararam: gasta o uso do limite (por turno/cena/descanso) e guarda o evento (idempotência).
export function registrarDisparos(ficha, disparados, { eventoId, cenaId = 'default' } = {}) {
    const caminhos = [];
    (disparados || []).forEach(({ chave, gatilho }) => {
        if (gatilho.limite && gatilho.limite.por === 'turno') {
            if (!ficha.combate) ficha.combate = {};
            if (!ficha.combate.usosPoderes) ficha.combate.usosPoderes = {};
            const reg = ficha.combate.usosPoderes[chave];
            ficha.combate.usosPoderes[chave] = { n: (reg && reg.turno === true ? Math.max(0, Math.floor(Number(reg.n) || 0)) : 0) + 1, cena: String(cenaId), turno: true };
            if (!caminhos.includes('combate/usosPoderes')) caminhos.push('combate/usosPoderes');
        } else if (gatilho.limite) {
            gastarUso(ficha, { id: chave, usosMax: gatilho.limite.max, usosPor: gatilho.limite.por }, cenaId);
            if (!caminhos.includes('combate/usosPoderes')) caminhos.push('combate/usosPoderes');
        }
        if (eventoId) {
            if (!ficha.combate) ficha.combate = {};
            if (!ficha.combate.gatilhos) ficha.combate.gatilhos = {};
            ficha.combate.gatilhos[chave] = { ultimoEvento: String(eventoId) };
            if (!caminhos.includes('combate/gatilhos')) caminhos.push('combate/gatilhos');
        }
    });
    return caminhos;
}

// Caminhos do Firebase tocados por mexer no contador de índice i (valor, e o Poder de Estágios ligado a ele com os vitais re-escalados).
function caminhosDoContador(ficha, i) {
    const c = ficha.contadores[i];
    const lista = [`contadores/${i}/valor`];
    if (c && c.poderId !== undefined) {
        const j = (ficha.poderes || []).findIndex(p => p && String(p.id) === String(c.poderId));
        if (j >= 0) { lista.push(`poderes/${j}/estagioAtual`); VITAIS_REGENERAVEIS.forEach(k => { if (ficha[k]) lista.push(`${k}/atual`); }); }
    }
    return lista;
}

// Caminhos tocados por ligar/desligar um Poder (mexe nos máximos e re-escala os vitais).
function caminhosDoLigarDesligar(ficha, id) {
    const j = (ficha.poderes || []).findIndex(p => p && String(p.id) === String(id));
    const lista = ['escudos', 'combate/usosPoderes'];
    if (j >= 0) lista.push(`poderes/${j}/ativa`, `poderes/${j}/recargaRestante`);
    VITAIS_REGENERAVEIS.forEach(k => { if (ficha[k]) lista.push(`${k}/atual`); });
    return lista;
}

// Executa as ações (já avaliadas) no rascunho. ctx: { vidaMaxBruta?, eventoId?, cenaId?, disparados?, jaDisparados?, profundidade?, nome?, rng? }.
// Ações que mexem em contadores e Poderes geram eventos derivados (contadorAtingiu, poderLigou, poderDesligou) tratados em cadeia (profundidade + 1).
export function aplicarAcoesNoRascunho(ficha, acoes, ctx = {}) {
    const textos = []; const caminhos = new Set(); let anulado = false;
    const derivados = [];
    const chavesDisparadas = (ctx.disparados || []).map(d => d.chave);
    const chavesNaCadeia = [...(Array.isArray(ctx.jaDisparados) ? ctx.jaDisparados : []), ...chavesDisparadas];
    if (!ficha || !Array.isArray(acoes)) return { textos, anulado, caminhos: [] };
    registrarDisparos(ficha, ctx.disparados, ctx).forEach(c => caminhos.add(c));
    const vidaMax = Number(ctx.vidaMaxBruta) > 0 ? Number(ctx.vidaMaxBruta) : getVidaMaxBrutaNpc(ficha);

    acoes.forEach((a) => {
        const nome = a.gatilhoNome || 'Gatilho';
        switch (a.tipo) {
            case 'anularDano':
                anulado = true; textos.push(`${nome} anulou o dano`); break;
            case 'definirVida': {
                if (!ficha.vida) break;
                // Percentual sem Vida máxima conhecida: ignora a ação (nunca grava Vida 0 por engano).
                if (a.valor === undefined && !(vidaMax > 0)) break;
                let bruto = a.valor !== undefined ? a.valor * FATOR_EXIBICAO_VITAIS : vidaMax * (a.percMax / 100);
                if (vidaMax > 0) bruto = Math.min(vidaMax, bruto);
                ficha.vida.atual = Math.max(0, bruto);
                caminhos.add('vida/atual');
                // Em danoQueZeraria, definir a Vida já anula o golpe (o dano restante não é aplicado depois).
                if (a.fase === 'antes') anulado = true;
                textos.push(`${nome} segurou em ${fmtN(ficha.vida.atual / FATOR_EXIBICAO_VITAIS)} de vida`);
                break;
            }
            case 'curar': {
                if (!ficha.vida) break;
                const atual = Number(ficha.vida.atual) || 0;
                let base = a.valor;
                if (a.modo === 'percMax') base = (vidaMax / FATOR_EXIBICAO_VITAIS) * (a.valor / 100);
                else if (a.modo === 'percAtual') base = (atual / FATOR_EXIBICAO_VITAIS) * (a.valor / 100);
                let eficacia = 1;
                try { eficacia = calcularEficaciaCura(ficha); } catch (e) { eficacia = 1; }
                const total = Math.floor(base * (Number.isFinite(eficacia) ? eficacia : 1));
                if (total <= 0) { textos.push(`${nome} tentou curar, mas a cura foi anulada`); break; }
                const teto = vidaMax > 0 ? vidaMax : Infinity;
                ficha.vida.atual = Math.max(atual, Math.min(teto, atual + total * FATOR_EXIBICAO_VITAIS));
                caminhos.add('vida/atual');
                textos.push(`${nome} curou ${fmtN(total)}`);
                break;
            }
            case 'escudo': {
                const id = `esc_g_${a.chave}`;
                // Troca atômica: se o novo escudo não couber (limite), o anterior volta. Com poderId, descansar/desligar o Poder o remove.
                const anterior = (Array.isArray(ficha.escudos) ? ficha.escudos : []).find(e => e && e.id === id);
                const guardado = anterior ? JSON.parse(JSON.stringify(anterior)) : null;
                removerEscudo(ficha, id);
                const poderId = a.fonte && a.fonte.tipo === 'poder' ? a.fonte.id : undefined;
                if (adicionarEscudo(ficha, { id, nome: a.nome, valor: a.valor, tipo: a.tipoEscudo, ...(poderId !== undefined ? { poderId } : {}) })) { textos.push(`${nome} deu ${a.nome} de ${fmtN(a.valor)}`); caminhos.add('escudos'); }
                else {
                    if (guardado) { if (!Array.isArray(ficha.escudos)) ficha.escudos = []; ficha.escudos.push(guardado); }
                    textos.push(`${nome}: sem espaço para ${a.nome}`);
                    caminhos.add('escudos');
                }
                break;
            }
            case 'buff': {
                const nomeBuff = `${nome} (${a.atributo})`;
                ficha.buffsTemporarios = somarBuffTemporario(ficha.buffsTemporarios, {
                    id: `bg_${a.chave}_${a.atributo}`, nome: nomeBuff, fonte: (a.fonte && a.fonte.nome) || nome,
                    efeitos: [{ atributo: a.atributo, propriedade: 'base', valor: a.valor, nome: nomeBuff }], duracao: a.duracao, duracaoModo: a.modo,
                });
                caminhos.add('buffsTemporarios');
                textos.push(`${nome} deu ${a.valor >= 0 ? '+' : ''}${a.valor} em ${a.atributo}`);
                break;
            }
            case 'limparCondicoes':
                if (Array.isArray(ficha.condicoes) && ficha.condicoes.length > 0) { delete ficha.condicoes; caminhos.add('condicoes'); textos.push(`${nome} limpou as condições`); }
                break;
            case 'imunidadeTotal':
                if (!ficha.combate) ficha.combate = {};
                ficha.combate.imunidadeTotal = { turnosRestantes: a.duracaoTurnos, origem: nome };
                caminhos.add('combate/imunidadeTotal');
                textos.push(`${nome}: Imunidade total por ${a.duracaoTurnos} turno(s)`);
                break;
            case 'mensagem':
                textos.push(`${nome}: ${a.texto}`); break;
            case 'contador': {
                // Só atua em contador que EXISTE na ficha (por id); id desconhecido é ignorado em silêncio.
                const i = Array.isArray(ficha.contadores) ? ficha.contadores.findIndex(c => c && String(c.id) === String(a.id)) : -1;
                if (i < 0) break;
                const c = ficha.contadores[i];
                const antes = Number(c.valor) || 0;
                const sinal = a.valor < 0 ? -1 : 1;
                const qtd = a.sorteio ? sinal * rolarSorteio(a.sorteio, ctx.rng) : a.valor;
                let alvo = antes;
                if (a.op === 'somar') alvo = antes + qtd;
                else if (a.op === 'definir') alvo = qtd;
                else if (a.op === 'zerar') alvo = 0;
                else if (a.op === 'dividir') alvo = Math.trunc(antes / a.valor);
                atualizarContador(ficha, c.id, { valor: alvo });
                const depois = Number(ficha.contadores[i].valor) || 0;
                if (depois === antes) break;
                caminhosDoContador(ficha, i).forEach(p => caminhos.add(p));
                textos.push(`${nome}: ${c.nome} ${antes} → ${depois}`);
                derivados.push({ tipo: 'contadorAtingiu', contadorId: String(c.id), valorAntes: antes, valorDepois: depois });
                break;
            }
            case 'aplicarEstado': {
                if (imuneAoEstado(ficha, a.estado)) { textos.push(`${nome}: imune a ${nomeDoEstado(a.estado)}`); break; }
                aplicarEstadoNaFicha(ficha, a.estado, a.stacks, (a.fonte && a.fonte.nome) || nome);
                caminhos.add('condicoes');
                textos.push(`${nome} aplicou ${a.stacks}x ${nomeDoEstado(a.estado)}`);
                break;
            }
            case 'removerEstado': {
                const antes = JSON.stringify(ficha.condicoes || []);
                const lista = tirarEstado(ficha.condicoes, a.estado);
                if (JSON.stringify(lista) === antes) break;
                if (lista.length === 0) delete ficha.condicoes; else ficha.condicoes = lista;
                caminhos.add('condicoes');
                textos.push(`${nome} removeu ${nomeDoEstado(a.estado)}`);
                break;
            }
            case 'ligarPoder': {
                const r = ligarPoderNoRascunho(ficha, a.poderId, ctx.cenaId || 'default');
                if (!r.ok) { if (r.motivo !== 'já está ligado') textos.push(`${nome}: não conseguiu ligar o Poder (${r.motivo})`); break; }
                caminhosDoLigarDesligar(ficha, a.poderId).forEach(p => caminhos.add(p));
                const p = ficha.poderes.find(po => String(po.id) === String(a.poderId));
                textos.push(`${nome} ligou ${p ? p.nome : 'o Poder'}${r.semEspacoEscudo ? ' (sem espaço para o escudo)' : ''}`);
                derivados.push({ tipo: 'poderLigou', poderId: String(a.poderId) });
                break;
            }
            case 'desligarPoder': {
                const p = (ficha.poderes || []).find(po => po && String(po.id) === String(a.poderId));
                if (!desligarPoderNoRascunho(ficha, a.poderId)) break;
                caminhosDoLigarDesligar(ficha, a.poderId).forEach(c => caminhos.add(c));
                textos.push(`${nome} desligou ${p ? p.nome : 'o Poder'}`);
                derivados.push({ tipo: 'poderDesligou', poderId: String(a.poderId) });
                break;
            }
            case 'danoEmSi': {
                if (!ficha.vida) break;
                let danoExibido = a.valor;
                if (a.modo === 'percMax') danoExibido = (vidaMax / FATOR_EXIBICAO_VITAIS) * (a.valor / 100);
                else if (a.modo === 'percAtual') danoExibido = ((Number(ficha.vida.atual) || 0) / FATOR_EXIBICAO_VITAIS) * (a.valor / 100);
                danoExibido = Math.floor(danoExibido);
                if (!(danoExibido > 0)) break;
                // Ponto único de dano (core/danoVida.js), direto na Vida (sem escudo): God Mode zera; gatilhos de Vida podem disparar (cadeia + 1).
                const r = aplicarDanoNaVida(ficha, danoExibido, { nome: ctx.nome || '', semEscudo: true, cenaId: ctx.cenaId, vidaMaxBruta: vidaMax, profundidade: (Number(ctx.profundidade) || 0) + 1, jaDisparados: chavesNaCadeia });
                r.caminhos.forEach(p => caminhos.add(p));
                if (!r.imune && !r.anulado) textos.push(`${nome} custou ${fmtN(danoExibido)} de vida`);
                r.textos.forEach(t => textos.push(t));
                break;
            }
            default: break;
        }
    });

    // Eventos derivados (contador atingiu N, Poder ligou/desligou): mesma ficha, um nível mais fundo; o gatilho que já disparou na cadeia não repete.
    derivados.forEach((ev) => {
        const sub = dispararEventoNaFicha(ficha, ev, { cenaId: ctx.cenaId, nome: ctx.nome, rng: ctx.rng, profundidade: (Number(ctx.profundidade) || 0) + 1, jaDisparados: chavesNaCadeia, ...(ctx.eventoId ? { eventoId: `${ctx.eventoId}:${ev.tipo}` } : {}) });
        sub.textos.forEach(t => textos.push(t));
        sub.caminhos.forEach(c => caminhos.add(c));
        sub.chaves.forEach((k) => { chavesNaCadeia.push(k); chavesDisparadas.push(k); });
    });
    return { textos, anulado, caminhos: [...caminhos], chaves: chavesDisparadas };
}

// Dispara um evento NO RASCUNHO da ficha (use dentro de updateFicha ou numa cópia): avalia os gatilhos automáticos que casam, executa as
// ações e trata os eventos derivados em cadeia. Sem gatilhos que casem, NÃO muda nada (exceções: turnoInicio zera os usos 'por turno' do dono e
// fimDeLuta também zera os contadores com reset 'cena'). ctx: { cenaId?, eventoId?, profundidade?, jaDisparados?, nome?, rng? }.
// Devolve { textos, caminhos, chaves, disparou }: caminhos no formato do Firebase (para gravar em OUTRA ficha com camposParaGravar).
export function dispararEventoNaFicha(ficha, evento, ctx = {}) {
    const res = { textos: [], caminhos: [], chaves: [], disparou: false };
    if (!ficha || !evento || !evento.tipo) return res;
    const caminhos = new Set();
    const cenaId = ctx.cenaId || 'default';
    if (evento.tipo === 'turnoInicio' || evento.tipo === 'fimDeLuta') { if (zerarUsosPorTurno(ficha)) caminhos.add('combate/usosPoderes'); }
    if (evento.tipo === 'fimDeLuta') {
        resetarContadoresDeCena(ficha).forEach(i => caminhosDoContador(ficha, i).forEach(p => caminhos.add(p)));
    }
    const profundidade = Number(ctx.profundidade) || 0;
    if (profundidade < PROFUNDIDADE_MAX_GATILHOS) {
        const coletados = coletarGatilhos(ficha, evento.tipo === 'poderDesligou' ? { tambemLigado: evento.poderId } : {}).filter(c => c.gatilho.evento.tipo === evento.tipo);
        if (coletados.length > 0) {
            const jaDisparados = Array.isArray(ctx.jaDisparados) ? ctx.jaDisparados : [];
            const av = avaliarGatilhos(evento, { eventoId: ctx.eventoId, cenaId, profundidade, jaDisparados }, ficha, { coletados });
            if (av.acoes.length > 0) {
                const r = aplicarAcoesNoRascunho(ficha, av.acoes, { cenaId, eventoId: ctx.eventoId, disparados: av.disparados, jaDisparados, profundidade, nome: ctx.nome, rng: ctx.rng });
                r.textos.forEach(t => res.textos.push(t));
                r.caminhos.forEach(c => caminhos.add(c));
                res.chaves = r.chaves;
                res.disparou = true;
            }
        }
    }
    res.caminhos = [...caminhos];
    return res;
}

// Valores atuais dos caminhos tocados, prontos para salvarCamposPersonagem (undefined vira null = apaga a chave).
export function camposParaGravar(ficha, caminhos) {
    const campos = {};
    (caminhos || []).forEach((caminho) => {
        let v = ficha;
        for (const parte of String(caminho).split('/')) { v = v === undefined || v === null ? undefined : v[parte]; }
        campos[caminho] = v === undefined ? null : v;
    });
    return campos;
}

// Campos de gatilhos/condições que mudaram entre duas versões da ficha (para gravar só eles no Firebase de OUTRO jogador).
// Formato { caminho: valor | null }. Usado no início do turno (estados que tiram Vida, Imunidade total que passa).
const CAMINHOS_GATILHOS = ['condicoes', 'combate/imunidadeTotal', 'combate/gatilhos', 'combate/usosPoderes'];
export function camposDeGatilhosAlterados(antes, depois) {
    const lido = (f, caminho) => caminho.split('/').reduce((v, p) => (v === undefined || v === null ? undefined : v[p]), f);
    const mudados = CAMINHOS_GATILHOS.filter(c => JSON.stringify(lido(antes, c)) !== JSON.stringify(lido(depois, c)));
    return camposParaGravar(depois, mudados);
}
