// ==========================================
// 🔔 APLICAR AÇÕES DE GATILHOS — lógica pura sobre o RASCUNHO da ficha (Immer) ou um clone solto.
// Quem decide QUAIS ações valem é core/gatilhos.js > avaliarGatilhos; aqui elas são executadas e viram frases do feed.
// Devolve { textos, anulado, caminhos }: `caminhos` = campos tocados (formato do Firebase: 'vida/atual', 'escudos'...), para quem grava
// numa ficha de OUTRO jogador mandar só eles (services/danoAlvo.js). Nada fica `undefined`: o que some vira delete na ficha e null no Firebase.
// ==========================================
import { FATOR_EXIBICAO_VITAIS, VITAIS_REGENERAVEIS } from './vitals.js';
import { coletarGatilhos, avaliarGatilhos, PROFUNDIDADE_MAX_GATILHOS } from './gatilhos.js';
import { atualizarContador, resetarContadoresDeCena } from './contadores.js';
import { nomeDoEstado } from './condicoes.js';
import { aplicarEstadoComDuracao, removerEstadoComDuracao, limparDuracoes, sortearDuracao, rotuloDuracao } from './duracaoEstados.js';
import { imuneAoEstado } from './efeitosCondicionais.js';
import { ligarPoderNoRascunho, desligarPoderNoRascunho } from './custoPorTurno.js';
import { aplicarDanoNaVida } from './danoVida.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';
import { calcularEficaciaCura } from './engine.js';
import { adicionarEscudo, removerEscudo } from './escudos.js';
import { gastarUso, limiteDeUsos } from './usosPoder.js';
import { somarBuffTemporario } from './suporte.js';
import { chaveDoGatilhoDoPoder, normalizarGatilhos, LIMITE_TOTAL_GANHO_PERMANENTE, LIMITE_GANHO_PERC_MIN, LIMITE_GANHO_PERMANENTE } from './gatilhos.js';
import { FATOR_PODER_MAX, FATOR_PODER_MIN, zerarGanhosCombate } from './poder.js';
import { CAMINHOS_ADAPTACAO } from './adaptacao.js';
import { CAMINHOS_ZENKAI } from './zenkai.js';
import { iniciarFim, concluirFim } from './aprovacaoPermanente.js';

const fmtN = (n) => Math.floor(Number(n) || 0).toLocaleString('pt-BR');
const fmtGanho = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });

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

// Fim de luta: cada Cena conta como um combate, então os usos "por cena" (limite de gatilho com por:'cena' e limite de ligar do Poder com
// usosPor:'cena') recomeçam. 'turno' sai em zerarUsosPorTurno e 'descanso' NUNCA é tocado aqui. Para achar as chaves, os Poderes são vistos
// como ligados (gatilhos de Poder desligado também têm uso guardado). Devolve true se apagou algo.
export function restaurarUsosPorCena(ficha) {
    const usos = ficha && ficha.combate && ficha.combate.usosPoderes;
    if (!usos || typeof usos !== 'object') return false;
    const chaves = new Set();
    const visao = { ...ficha, poderes: (ficha.poderes || []).map(p => (p && typeof p === 'object' ? { ...p, ativa: true } : p)) };
    coletarGatilhos(visao).forEach(({ gatilho, chave }) => { if (gatilho.limite && gatilho.limite.por === 'cena') chaves.add(chave); });
    (ficha.poderes || []).forEach((p) => { const l = p && typeof p === 'object' ? limiteDeUsos(p) : null; if (l && l.por === 'cena') chaves.add(String(p.id)); });
    let mudou = false;
    chaves.forEach((k) => { if (usos[k] && usos[k].turno !== true) { delete usos[k]; mudou = true; } });
    if (mudou && Object.keys(usos).length === 0) delete ficha.combate.usosPoderes;
    return mudou;
}

// O que a cadeia de gatilhos herda do contexto: rng (testes), decisões/lista de perguntas do modo opcional e o atacante do golpe.
const herdar = (ctx) => ({ rng: ctx.rng, escolher: ctx.escolher, decisoes: ctx.decisoes, perguntas: ctx.perguntas, atacante: ctx.atacante, danoRecebido: ctx.danoRecebido });

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

// Executa as ações (já avaliadas) no rascunho. ctx: { vidaMaxBruta?, eventoId?, cenaId?, disparados?, jaDisparados?, profundidade?, nome?, rng?,
//   atacante?: { nome } (personagem que causou o golpe), danoRecebido? (dano exibido do golpe), decisoes?, perguntas? }.
// Devolve também `externos`: efeitos em OUTRA ficha que quem chamou precisa aplicar depois ({ tipo: 'danoNoAtacante', atacante, dano, gatilhoNome }).
// Ações que mexem em contadores e Poderes geram eventos derivados (contadorAtingiu, poderLigou, poderDesligou) tratados em cadeia (profundidade + 1).
export function aplicarAcoesNoRascunho(ficha, acoes, ctx = {}) {
    const textos = []; const caminhos = new Set(); let anulado = false;
    const derivados = []; const externos = [];
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
                if (Array.isArray(ficha.condicoes) && ficha.condicoes.length > 0) { delete ficha.condicoes; caminhos.add('condicoes'); if (limparDuracoes(ficha)) caminhos.add('duracaoEstados'); textos.push(`${nome} limpou as condições`); }
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
                // ⏳ Duração (número ou dado) sorteada AGORA com o rng do contexto; sem `duracao` o estado é permanente.
                const duracao = a.duracao === undefined ? null : sortearDuracao(a.duracao, ctx.rng);
                const mapaAntes = JSON.stringify(ficha.duracaoEstados || null);
                aplicarEstadoComDuracao(ficha, a.estado, a.stacks, (a.fonte && a.fonte.nome) || nome, duracao);
                caminhos.add('condicoes');
                if (JSON.stringify(ficha.duracaoEstados || null) !== mapaAntes) caminhos.add('duracaoEstados');
                textos.push(`${nome} aplicou ${a.stacks}x ${nomeDoEstado(a.estado)}${duracao ? ` (${rotuloDuracao(duracao)})` : ''}`);
                break;
            }
            case 'removerEstado': {
                const mapaAntes = JSON.stringify(ficha.duracaoEstados || null);
                if (!removerEstadoComDuracao(ficha, a.estado)) break;
                caminhos.add('condicoes');
                if (JSON.stringify(ficha.duracaoEstados || null) !== mapaAntes) caminhos.add('duracaoEstados');
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
                const r = aplicarDanoNaVida(ficha, danoExibido, { nome: ctx.nome || '', semEscudo: true, autoInfligido: true, cenaId: ctx.cenaId, vidaMaxBruta: vidaMax, profundidade: (Number(ctx.profundidade) || 0) + 1, jaDisparados: chavesNaCadeia, rng: ctx.rng, decisoes: ctx.decisoes, perguntas: ctx.perguntas, escolher: ctx.escolher });
                r.caminhos.forEach(p => caminhos.add(p));
                (r.externos || []).forEach(e => externos.push(e));
                if (!r.imune && !r.anulado) textos.push(`${nome} custou ${fmtN(danoExibido)} de vida`);
                r.textos.forEach(t => textos.push(t));
                break;
            }
            case 'danoNoAtacante': {
                // Só com o atacante-personagem conhecido; o dano é aplicado por quem chamou (na ficha dele, pelo ponto único de dano dele).
                if (!ctx.atacante || !ctx.atacante.nome) { textos.push(`${nome}: dano no atacante ignorado (atacante desconhecido ou sem ficha)`); break; }
                const dano = Math.floor(a.modo === 'fixo' ? a.valor : (Number(ctx.danoRecebido) || 0) * (a.valor / 100));
                if (!(dano > 0)) break;
                externos.push({ tipo: 'danoNoAtacante', atacante: ctx.atacante, dano, gatilhoNome: nome });
                textos.push(`${nome}: ${fmtN(dano)} de dano volta para ${ctx.atacante.nome}`);
                break;
            }
            case 'ganhoPermanente': {
                // Ganho de Poder (permanente => ficha.ganhosPermanentes; duracao combate => ficha.ganhosCombate). Legado (bruto): soma ao total aditivo [dest].poderCalculado. Percentual: ver abaixo (soma p/100 ou multiplica fatorPoder).
                // Fixo, ou valor ATUAL do contador x fator (zerar opcional).
                const dest = a.duracao === 'combate' ? 'ganhosCombate' : 'ganhosPermanentes'; const sufDur = dest === 'ganhosCombate' ? ' até o fim do combate' : '';
                let ganho = 0; let origem = ''; let iZerar = -1;
                if (a.deContador) {
                    const i = Array.isArray(ficha.contadores) ? ficha.contadores.findIndex(c => c && String(c.id) === String(a.deContador.id)) : -1;
                    if (i < 0) break;
                    const c = ficha.contadores[i];
                    const v = Number(c.valor) || 0;
                    ganho = v * a.deContador.fator;
                    origem = `${c.nome} ${v} x ${a.deContador.fator}`;
                    if (a.deContador.zerar) iZerar = i;
                } else { ganho = Number(a.valor); origem = 'valor fixo'; }
                if (!Number.isFinite(ganho)) break;
                if (a.unidade === 'percentual') {
                    // Percentual: p em %, limitado por disparo (nunca zera o Poder). 'somar' = linear no total aditivo; 'multiplicar' = composto em fatorPoder.
                    const p = Math.max(LIMITE_GANHO_PERC_MIN, Math.min(LIMITE_GANHO_PERMANENTE, ganho));
                    if (p === 0) break;
                    if (!ficha[dest] || typeof ficha[dest] !== 'object') ficha[dest] = {};
                    if (a.modo === 'multiplicar') {
                        const atualFp = Number(ficha[dest].fatorPoder);
                        const baseFp = Number.isFinite(atualFp) && atualFp > 0 ? atualFp : 1;
                        const fator = Math.round(Math.min(FATOR_PODER_MAX, Math.max(FATOR_PODER_MIN, baseFp * (1 + p / 100))) * 1e9) / 1e9;
                        ficha[dest].fatorPoder = fator;
                        caminhos.add(dest + '/fatorPoder');
                        textos.push(`${nome}: ${p > 0 ? '+' : ''}${fmtGanho(p)}% de Poder, multiplica (${origem}); fator ${fmtGanho(fator)}x${sufDur}`);
                    } else {
                        const atualGp = Number(ficha[dest].poderCalculado);
                        const base = Number.isFinite(atualGp) && atualGp > 0 ? atualGp : 0;
                        const total = Math.round(Math.max(0, Math.min(LIMITE_TOTAL_GANHO_PERMANENTE, base + p / 100)) * 1e9) / 1e9;
                        ficha[dest].poderCalculado = total;
                        caminhos.add(dest + '/poderCalculado');
                        textos.push(`${nome}: ${p > 0 ? '+' : ''}${fmtGanho(p)}% de Poder, soma (${origem}); total ${fmtGanho(total * 100)}%${sufDur}`);
                    }
                } else {
                    if (!(ganho > 0)) break;
                    const atualGp = Number(ficha[dest] && ficha[dest].poderCalculado);
                    const base = Number.isFinite(atualGp) && atualGp > 0 ? atualGp : 0;
                    const total = Math.round(Math.min(LIMITE_TOTAL_GANHO_PERMANENTE, base + ganho) * 1e9) / 1e9;
                    if (!ficha[dest] || typeof ficha[dest] !== 'object') ficha[dest] = {};
                    ficha[dest].poderCalculado = total;
                    caminhos.add(dest + '/poderCalculado');
                    textos.push(`${nome}: +${fmtGanho(ganho)} de Poder ${dest === 'ganhosCombate' ? 'até o fim do combate' : 'permanente'} (${origem}); total ${fmtGanho(total)}`);
                }
                if (iZerar >= 0) {
                    const c = ficha.contadores[iZerar];
                    const antes = Number(c.valor) || 0;
                    atualizarContador(ficha, c.id, { valor: 0 });
                    const depois = Number(ficha.contadores[iZerar].valor) || 0;
                    if (depois !== antes) {
                        caminhosDoContador(ficha, iZerar).forEach(p => caminhos.add(p));
                        textos.push(`${nome}: ${c.nome} ${antes} → ${depois}`);
                        derivados.push({ tipo: 'contadorAtingiu', contadorId: String(c.id), valorAntes: antes, valorDepois: depois });
                    }
                }
                break;
            }
            case 'rolarTabela': {
                // Um rolar por aplicação (rng injetável). Sem linha correspondente: nada acontece. As ações da linha passam por este mesmo executor (um nível mais fundo).
                const rolado = rolarSorteio(a.dado, ctx.rng);
                const linha = (a.resultados || []).find(r => r.ate >= rolado);
                const dadoTxt = /^1d/i.test(a.dado) ? a.dado.slice(1) : a.dado;
                textos.push(`${nome} rolou ${rolado} (${dadoTxt})${linha ? (linha.texto ? `: ${linha.texto}` : '') : ': nada acontece'}`);
                if (!linha) break;
                const aninhadas = linha.acoes.map(x => ({ ...x, gatilhoId: a.gatilhoId, gatilhoNome: a.gatilhoNome, fase: a.fase, chave: a.chave, fonte: a.fonte }));
                const r = aplicarAcoesNoRascunho(ficha, aninhadas, { ...herdar(ctx), cenaId: ctx.cenaId, nome: ctx.nome, vidaMaxBruta: vidaMax, eventoId: ctx.eventoId ? `${ctx.eventoId}:tab` : undefined, jaDisparados: chavesNaCadeia, profundidade: (Number(ctx.profundidade) || 0) + 1 });
                if (r.anulado) anulado = true;
                r.textos.forEach(t => textos.push(t));
                r.caminhos.forEach(c => caminhos.add(c));
                (r.externos || []).forEach(e => externos.push(e));
                (r.chaves || []).forEach((k) => { chavesNaCadeia.push(k); chavesDisparadas.push(k); });
                break;
            }
            case 'pedirEscolha': {
                // Quem escolhe é o DONO, no cliente dele: ctx.escolher(pergunta, [textos]) => índice | null (síncrono). Regra segura: sem escolher
                // (ficha de outro jogador, Mestre, teste puro), cancelado ou índice inválido => NENHUMA opção é aplicada e o feed avisa.
                // Em simulação de perguntas (ctx.perguntas) nunca abre diálogo. A opção escolhida passa por este mesmo executor (um nível mais fundo).
                const ops = a.opcoes || [];
                let idx = null;
                if (typeof ctx.escolher === 'function' && !Array.isArray(ctx.perguntas)) {
                    try { idx = ctx.escolher(a.pergunta || `${nome}: escolha uma opção`, ops.map(o => o.texto), a.chave); } catch (e) { idx = null; }
                }
                const op = Number.isInteger(idx) ? ops[idx] : null;
                if (!op) { if (!Array.isArray(ctx.perguntas)) textos.push(`${nome}: escolha ignorada (nenhuma opção aplicada)`); break; }
                textos.push(`${nome}: escolheu "${op.texto}"`);
                const aninhadas = op.acoes.map(x => ({ ...x, gatilhoId: a.gatilhoId, gatilhoNome: a.gatilhoNome, fase: a.fase, chave: a.chave, fonte: a.fonte }));
                const r = aplicarAcoesNoRascunho(ficha, aninhadas, { ...herdar(ctx), cenaId: ctx.cenaId, nome: ctx.nome, vidaMaxBruta: vidaMax, eventoId: ctx.eventoId ? `${ctx.eventoId}:esc` : undefined, jaDisparados: chavesNaCadeia, profundidade: (Number(ctx.profundidade) || 0) + 1 });
                if (r.anulado) anulado = true;
                r.textos.forEach(t => textos.push(t));
                r.caminhos.forEach(c => caminhos.add(c));
                (r.externos || []).forEach(e => externos.push(e));
                (r.chaves || []).forEach((k) => { chavesNaCadeia.push(k); chavesDisparadas.push(k); });
                break;
            }
            default: break;
        }
    });

    // Eventos derivados (contador atingiu N, Poder ligou/desligou): mesma ficha, um nível mais fundo; o gatilho que já disparou na cadeia não repete.
    derivados.forEach((ev) => {
        const sub = dispararEventoNaFicha(ficha, ev, { cenaId: ctx.cenaId, nome: ctx.nome, ...herdar(ctx), profundidade: (Number(ctx.profundidade) || 0) + 1, jaDisparados: chavesNaCadeia, ...(ctx.eventoId ? { eventoId: `${ctx.eventoId}:${ev.tipo}` } : {}) });
        sub.textos.forEach(t => textos.push(t));
        sub.caminhos.forEach(c => caminhos.add(c));
        (sub.externos || []).forEach(e => externos.push(e));
        sub.chaves.forEach((k) => { chavesNaCadeia.push(k); chavesDisparadas.push(k); });
    });
    return { textos, anulado, caminhos: [...caminhos], chaves: chavesDisparadas, ...(externos.length > 0 ? { externos } : {}) };
}

// Dispara um evento NO RASCUNHO da ficha (use dentro de updateFicha ou numa cópia): avalia os gatilhos automáticos que casam, executa as
// ações e trata os eventos derivados em cadeia. Sem gatilhos que casem, NÃO muda nada (exceções: turnoInicio zera os usos 'por turno' do dono e
// fimDeLuta também zera os contadores com reset 'cena' e, depois de avaliar, restaura os usos 'por cena'). ctx: { cenaId?, eventoId?, profundidade?, jaDisparados?, nome?, rng? }.
// Devolve { textos, caminhos, chaves, disparou }: caminhos no formato do Firebase (para gravar em OUTRA ficha com camposParaGravar).
export function dispararEventoNaFicha(ficha, evento, ctx = {}) {
    const res = { textos: [], caminhos: [], chaves: [], disparou: false };
    if (!ficha || !evento || !evento.tipo) return res;
    const caminhos = new Set();
    const cenaId = ctx.cenaId || 'default';
    // 💥 Zenkai: res.textosZenkai só existe no fimDeLuta (frases próprias do Zenkai, para o feed à parte). ctx.zenkaiPct = valor final do Mestre (em %).
    if (evento.tipo === 'fimDeLuta') res.textosZenkai = [];
    const modoPermanente = ctx.permanente || 'converter';
    let fimPermanente = null;
    if (evento.tipo === 'turnoInicio' || evento.tipo === 'fimDeLuta') { if (zerarUsosPorTurno(ficha)) caminhos.add('combate/usosPoderes'); }
    if (evento.tipo === 'fimDeLuta') {
        resetarContadoresDeCena(ficha).forEach(i => caminhosDoContador(ficha, i).forEach(p => caminhos.add(p)));
        // 🧬 Adaptação: por padrão ('converter') a média das % ganhas nos turnos vira Poder PERMANENTE e o fator de combate zera (core/adaptacao.js). Idempotente.
        // ctx.permanente: 'liberar'/'recusar' = decisão do Mestre; 'adiar' = combate ainda ativo; 'limpar' = sem combate (core/aprovacaoPermanente.js).
        try {
            fimPermanente = iniciarFim(ficha, modoPermanente, { nomeZenkai: ctx.nome, zenkaiPct: ctx.zenkaiPct });
            fimPermanente.caminhos.forEach(c => caminhos.add(c));
            fimPermanente.textos.forEach(t => res.textos.push(t));
            fimPermanente.textosZenkai.forEach(t => res.textosZenkai.push(t));
        } catch (e) { console.error('Conversão da Adaptação falhou', e); }
    }
    const profundidade = Number(ctx.profundidade) || 0;
    if (profundidade < PROFUNDIDADE_MAX_GATILHOS) {
        const coletados = coletarGatilhos(ficha, evento.tipo === 'poderDesligou' ? { tambemLigado: evento.poderId } : {}).filter(c => c.gatilho.evento.tipo === evento.tipo);
        if (coletados.length > 0) {
            const jaDisparados = Array.isArray(ctx.jaDisparados) ? ctx.jaDisparados : [];
            const av = avaliarGatilhos(evento, { eventoId: ctx.eventoId, cenaId, profundidade, jaDisparados, decisoes: ctx.decisoes, perguntas: ctx.perguntas }, ficha, { coletados });
            if (av.acoes.length > 0) {
                const r = aplicarAcoesNoRascunho(ficha, av.acoes, { cenaId, eventoId: ctx.eventoId, disparados: av.disparados, jaDisparados, profundidade, nome: ctx.nome, ...herdar(ctx) });
                (r.externos || []).forEach(e => { if (!res.externos) res.externos = []; res.externos.push(e); });
                r.textos.forEach(t => res.textos.push(t));
                r.caminhos.forEach(c => caminhos.add(c));
                res.chaves = r.chaves;
                res.disparou = true;
            }
        }
    }
    // Por ÚLTIMO: os gatilhos de fimDeLuta (inclusive os com limite por cena) já foram avaliados com os usos do combate que acabou, então
    // cada um dispara uma vez por combate; só depois os usos por cena recomeçam para o próximo.
    if (evento.tipo === 'fimDeLuta' && restaurarUsosPorCena(ficha)) caminhos.add('combate/usosPoderes');
    // ⚔️ Ganhos de Poder 'durante o combate' zeram DEPOIS dos gatilhos de fimDeLuta (que podem converter contadores em ganho permanente).
    if (evento.tipo === 'fimDeLuta' && zerarGanhosCombate(ficha)) { caminhos.add('ganhosCombate/poderCalculado'); caminhos.add('ganhosCombate/fatorPoder'); }
    // ✅ Por fim: a recusa do Mestre devolve os ganhos permanentes à foto de antes do combate (desfaz também o que os gatilhos de fimDeLuta ganharam) e a foto some.
    if (evento.tipo === 'fimDeLuta') {
        try {
            const fim2 = concluirFim(ficha, modoPermanente, { pendencias: fimPermanente && fimPermanente.pendencias });
            fim2.caminhos.forEach(c => caminhos.add(c));
            fim2.textos.forEach(t => res.textos.push(t));
        } catch (e) { console.error('Aprovação dos ganhos permanentes falhou', e); }
    }
    res.caminhos = [...caminhos];
    return res;
}

// 🔔 O MESTRE força um gatilho de um Poder (botão "Forçar disparo"): executa as ações AGORA, ignorando evento, condições, armado, desligado pelo
// Mestre e o LIMITE de usos (e sem gastá-lo nem marcar o evento). God Mode e as travas das próprias ações (usos/recarga ao ligar Poder etc.) continuam valendo.
// ctx: { cenaId?, nome?, rng?, atacante?, danoRecebido? }. Devolve { achou, textos, caminhos, externos }; os textos já dizem "forçado pelo Mestre".
export function forcarGatilhoNaFicha(ficha, poderId, gatilhoId, ctx = {}) {
    const vazio = { achou: false, textos: [], caminhos: [], externos: [] };
    const poder = ficha && Array.isArray(ficha.poderes) ? ficha.poderes.find(p => p && String(p.id) === String(poderId)) : null;
    const bruto = poder && Array.isArray(poder.gatilhos) ? poder.gatilhos.find(g => g && g.id === gatilhoId) : null;
    if (!bruto) return vazio;
    const g = normalizarGatilhos([bruto], { persistir: false }).gatilhos[0];
    if (!g) return vazio;
    const chave = chaveDoGatilhoDoPoder(poder.id, g.id);
    const fonte = { tipo: 'poder', id: String(poder.id), nome: String(poder.nome || 'Poder') };
    const acoes = g.acoes.map(a => ({ ...a, gatilhoId: g.id, gatilhoNome: g.nome, fase: g.fase, chave, fonte }));
    try {
        const r = aplicarAcoesNoRascunho(ficha, acoes, { cenaId: ctx.cenaId || 'default', nome: ctx.nome, rng: ctx.rng, atacante: ctx.atacante, danoRecebido: ctx.danoRecebido, vidaMaxBruta: ctx.vidaMaxBruta });
        return { achou: true, textos: [`${g.nome} forçado pelo Mestre`, ...r.textos], caminhos: r.caminhos, externos: r.externos || [] };
    } catch (e) { console.error('Forçar gatilho falhou', e); return { achou: true, textos: [`${g.nome} forçado pelo Mestre, mas falhou`], caminhos: [], externos: [] }; }
}

// Sorteia ANTES (fora do produtor Immer) uma sequência de números para o `rng` de um gatilho: se o produtor rodar de novo, `reiniciar()` repete as mesmas rolagens.
export function rngPreSorteado(n = 24) {
    const valores = Array.from({ length: n }, () => Math.random());
    let i = 0;
    const rng = () => valores[(i++) % n];
    rng.reiniciar = () => { i = 0; };
    return rng;
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
const CAMINHOS_GATILHOS = ['ganhosPermanentes/poderCalculado', 'ganhosPermanentes/fatorPoder', ...CAMINHOS_ADAPTACAO, 'combate/ganhosAntesDoCombate', ...CAMINHOS_ZENKAI, 'ganhosCombate/poderCalculado', 'ganhosCombate/fatorPoder', 'condicoes', 'duracaoEstados', 'combate/imunidadeTotal', 'combate/gatilhos', 'combate/usosPoderes'];
export function camposDeGatilhosAlterados(antes, depois) {
    const lido = (f, caminho) => caminho.split('/').reduce((v, p) => (v === undefined || v === null ? undefined : v[p]), f);
    const mudados = CAMINHOS_GATILHOS.filter(c => JSON.stringify(lido(antes, c)) !== JSON.stringify(lido(depois, c)));
    return camposParaGravar(depois, mudados);
}
