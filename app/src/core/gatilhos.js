// ==========================================
// 🔔 GATILHOS — lógica pura. Um gatilho é DADO (poder.gatilhos[], também em formas, itens equipados e passivas):
//   { id, nome, notas?, passivo?, mestreDesligou?, evento: { tipo, de?, ate? }, condicoes: [], limite?: { max, por },
//     modo: 'automatico' | 'opcional', armado?, prioridade, fase, acoes: [ { tipo, ...params } ] }
// Fase 1 e 2 (modo automático) + Fase 3 (modo opcional: dispara só com `armado === true` (consentimento explícito: ausente ou não booleano = DESARMADO); `perguntar` pede ao dono antes quando o dano é aplicado no cliente dele):
//   eventos: danoQueZeraria (fase 'antes': o dano final, já depois de Reduções e escudo, levaria a Vida a 0) e
//            vidaAbaixoDe {de, ate} (fase 'depois': a Vida terminou dentro da faixa [ate, de] % da Vida máxima BRUTA, vindo de fora dela).
//   Fase 2: acertou {nivel: normal|critico|fatal|qualquer} (no cliente do atacante, depois de o golpe causar dano; em área conta UMA vez),
//            errou (todos os alvos do teste de acerto escaparam), atingido {nivel?} (quem sofreu o golpe, no ponto único de dano; God Mode não dispara),
//            inimigoErrou (o golpe de alguém errou ESTE alvo), turnoInicio / turnoFim (dono do turno), poderLigou / poderDesligou {poderId?} (vazio = o próprio
//            Poder dono do gatilho; 'qualquer' = qualquer Poder), inicioDeLuta (o Mestre iniciou o combate da cena), fimDeLuta (encerrar combate / descansar; cada cena conta como um combate) e
//            contadorAtingiu {contadorId, op: '>='|'==', valor} (derivado: depois de uma ação de contador, só na BORDA, isto é, quando passa a valer).
//   ações:   anularDano, definirVida, curar, escudo, buff, limparCondicoes, imunidadeTotal, mensagem;
//            Fase 2: contador {id, op: somar|definir|zerar|dividir, valor, sorteio?: 'NdM'} (só atua em contador EXISTENTE na ficha, por id; se o id
//            não existe, ignora em silêncio; com sorteio o valor vira a soma dos dados e `valor` só dá o SINAL), aplicarEstado {estado, stacks, duracao? turnos 1 a 99 ou dado NdM(+K)} (respeita
//            imunidade a estado), removerEstado {estado}, ligarPoder {poderId} (passa pelas travas de usos e recarga) / desligarPoder {poderId},
//            danoEmSi {modo: fixo|percMax|percAtual, valor} (ponto único de dano; God Mode zera).
//   Fase 3: rolarTabela {dado: 'NdM', resultados: [{ ate, texto?, acoes: [...] }]} (até 12 linhas, `ate` estritamente crescente; vale a PRIMEIRA linha com
//            ate >= rolado; sem linha correspondente nada acontece; ações aninhadas seguem as regras das ações comuns, sem rolarTabela dentro de rolarTabela)
//   Fase 3: pedirEscolha {pergunta?, opcoes: [{ texto, acoes: [...] }]} (2 a 6 opções; o DONO escolhe no próprio cliente via ctx.escolher; sem escolha NADA é aplicado;
//            sem rolarTabela/pedirEscolha dentro das opções)
//            e danoNoAtacante {modo: 'percDanoRecebido'|'fixo', valor} (só atua quando o atacante-personagem é conhecido no contexto; senão avisa e ignora).
//   Modo: 'automatico' (sempre vale; ignora `armado`) | 'opcional' (`armado` guardado NO PRÓPRIO gatilho; dono e Mestre alternam; `perguntar: true` pede confirmação
//            ao dono quando o dano é aplicado no cliente dele; "Não" = não dispara e NÃO gasta o limite; em outro cliente/dono offline vale só `armado`).
//   ganhoPermanente {valor} | {deContador:{id, fator, zerar?}}: soma ao total ficha.ganhosPermanentes.poderCalculado (só cresce por gatilho; o Mestre ajusta à mão),
//            que entra no Poder Calculado como fonte ADITIVA 'Ganho_Permanente' do grupo MGERAL (core/poder.js > getGlobalMultipliers). Com deContador o ganho é
//            valor atual do contador × fator (contador inexistente ou ganho <= 0: nada acontece); `zerar` zera o contador depois.
//            Campos novos: `unidade: 'percentual'|'bruto'` e `modo: 'somar'|'multiplicar'`. Ausência de `unidade` E de `modo` = 'bruto' + 'somar' (legado, sem migração); `modo` sem `unidade` = percentual.
//            Percentual: valor/fator = p em % (-99,99..1e6 por disparo). 'somar' acrescenta p/100 ao total aditivo (poderCalculado); 'multiplicar' multiplica
//            ficha.ganhosPermanentes.fatorPoder (default 1) por (1 + p/100) (composto; entra em totalDano de getGlobalMultipliers).
//            `duracao: 'permanente'|'combate'` (ausente = permanente, formato antigo): 'combate' grava em ficha.ganhosCombate {poderCalculado, fatorPoder} (mesmas regras),
//            que ZERA no fimDeLuta (depois dos gatilhos de fimDeLuta), no descansarCompleto e quando o Mestre aperta Zerar. Entra no Poder como fonte 'Ganho_Combate' + fatorGanhoCombate.
//   Gatilho disparado dentro de outro gatilho respeita profundidade máx. 3 e o mesmo gatilho não dispara 2x na cadeia.
// Faixas de Vida: o percentual é arredondado PARA BAIXO ao inteiro antes de comparar (6,9% conta como 6); a faixa é inclusiva nas duas pontas.
// Um golpe que cruza várias faixas só dispara a faixa onde a Vida TERMINA (as outras não contêm a Vida final) e só na borda (entrando de fora).
// Limites: 'turno' (uso por turno do dono; zera no turnoInicio dele e no fim da luta) | 'cena' | 'descanso' (core/usosPoder.js).
// Idempotência: ficha.combate.gatilhos[chave].ultimoEvento === eventoId bloqueia o mesmo evento aplicado duas vezes.
// No evento danoQueZeraria, 'definirVida' JÁ ANULA o golpe (o dano restante não é aplicado depois); 'curar' cura ANTES do dano e, se ainda zerar, não salva.
// 'anularDano' só existe em danoQueZeraria (em vidaAbaixoDe o gatilho é descartado).
// Imunidade total de N turnos vale do disparo até o início do N-ésimo turno seguinte do dono (1 = até o início do próximo turno dele); o fim do combate também a encerra.
// Aqui NADA muta a ficha: avaliarGatilhos só decide; quem aplica é core/gatilhosAplicar.js.
// ==========================================
import { passaQuando, montarContextoDeCombate, normalizarQuando } from './efeitosCondicionais.js';
import { efeitosDaConfigAtiva, efeitosAtivosLigados } from './efeitosItem.js';
import { normalizarUsos, usosRestantes, LIMITE_USOS } from './usosPoder.js';
import { ehEstadoValido, MAX_STACKS, nomeDoEstado } from './condicoes.js';
import { normalizarDuracaoSpec, descreverDuracaoSpec } from './duracaoEstados.js';
import { FATOR_EXIBICAO_VITAIS } from './vitals.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';

export const PROFUNDIDADE_MAX_GATILHOS = 3;
export const LIMITE_GATILHOS_POR_FONTE = 8;
export const LIMITE_ACOES_POR_GATILHO = 6;
export const LIMITE_VALOR_GATILHO = 1e15;
export const LIMITE_TURNOS_IMUNIDADE = 10;
export const LIMITE_DURACAO_BUFF_GATILHO = 20;
export const LIMITE_CONTADOR_GATILHO = 9999;
export const LIMITE_LINHAS_TABELA = 12;
// pedirEscolha: de 2 a 6 opções; cada uma com 1 a LIMITE_ACOES_POR_GATILHO ações (sem rolarTabela/pedirEscolha dentro).
export const MIN_OPCOES_ESCOLHA = 2;
export const LIMITE_OPCOES_ESCOLHA = 6;
export const LIMITE_GANHO_PERMANENTE = 1e6;
export const LIMITE_FATOR_GANHO = 1e6;
export const LIMITE_TOTAL_GANHO_PERMANENTE = 1e9;
// ganhoPermanente em %: por disparo, p fica entre -99,99 e 1e6 (nunca zera o Poder).
export const LIMITE_GANHO_PERC_MIN = -99.99;
export const LIMITE_ATE_TABELA = 100000;
export const NIVEIS_ACERTO = ['qualquer', 'normal', 'critico', 'fatal'];
export const OPS_CONTADOR_ACAO = ['somar', 'definir', 'zerar', 'dividir'];
export const OPS_CONTADOR_EVENTO = ['>=', '=='];

export const EVENTOS_GATILHO = [
    { id: 'danoQueZeraria', fase: 'antes', rotulo: 'Quando um golpe me levaria a 0 de vida' },
    { id: 'vidaAbaixoDe', fase: 'depois', rotulo: 'Quando a Vida cair para entre X% e Y%' },
    { id: 'acertou', fase: 'depois', rotulo: 'Quando eu acertar um golpe' },
    { id: 'errou', fase: 'depois', rotulo: 'Quando eu errar um golpe' },
    { id: 'atingido', fase: 'depois', rotulo: 'Quando eu sofrer dano na Vida num golpe' },
    { id: 'inimigoErrou', fase: 'depois', rotulo: 'Quando um golpe errar em mim' },
    { id: 'turnoInicio', fase: 'depois', rotulo: 'No início do meu turno' },
    { id: 'turnoFim', fase: 'depois', rotulo: 'No fim do meu turno' },
    { id: 'poderLigou', fase: 'depois', rotulo: 'Quando o Poder ligar' },
    { id: 'poderDesligou', fase: 'depois', rotulo: 'Quando o Poder desligar' },
    { id: 'inicioDeLuta', fase: 'depois', rotulo: 'No início do combate' },
    { id: 'fimDeLuta', fase: 'depois', rotulo: 'No fim da cena/combate' },
    { id: 'contadorAtingiu', fase: 'depois', rotulo: 'Quando um contador chegar a N (por gatilho)' },
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
    { id: 'contador', rotulo: 'Mexer num contador' },
    { id: 'aplicarEstado', rotulo: 'Aplicar um estado em mim' },
    { id: 'removerEstado', rotulo: 'Remover um estado' },
    { id: 'ligarPoder', rotulo: 'Ligar um Poder' },
    { id: 'desligarPoder', rotulo: 'Desligar um Poder' },
    { id: 'danoEmSi', rotulo: 'Sofrer dano' },
    { id: 'rolarTabela', rotulo: 'Rolar tabela' },
    { id: 'pedirEscolha', rotulo: 'Pedir uma escolha' },
    { id: 'danoNoAtacante', rotulo: 'Dano no atacante' },
    { id: 'ganhoPermanente', rotulo: 'Ganho de Poder' },
];
export const PERIODOS_GATILHO = [
    { id: 'turno', rotulo: 'por turno' },
    { id: 'cena', rotulo: 'por cena' },
    { id: 'descanso', rotulo: 'por descanso' },
];
export const MODOS_GATILHO = ['automatico', 'opcional'];
export const MODOS_CURA = ['fixo', 'percMax', 'percAtual'];
export const MODOS_DANO_EM_SI = ['fixo', 'percMax', 'percAtual'];
export const MODOS_DANO_NO_ATACANTE = ['percDanoRecebido', 'fixo'];

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

// 'NdM' (1 a 20 dados, 1 a 1000 faces) em forma canônica; '' se vazio ou inválido.
export function normalizarSorteio(bruto) {
    const m = /^\s*(\d{1,2})\s*d\s*(\d{1,4})\s*$/i.exec(String(bruto ?? ''));
    if (!m) return '';
    const n = Number(m[1]); const f = Number(m[2]);
    return n >= 1 && n <= 20 && f >= 1 && f <= 1000 ? `${n}d${f}` : '';
}

// Ação limpa ou null (desconhecida ou com valor inválido). Nenhum campo `undefined`.
// opcoes: { eventoTipo?, dentroDeTabela? } — dentro de uma tabela não cabe outra tabela e 'anularDano' só vale em danoQueZeraria.
export function normalizarAcaoGatilho(bruta, opcoes = {}) {
    if (!bruta || typeof bruta !== 'object' || !ID_ACAO.has(bruta.tipo)) return null;
    switch (bruta.tipo) {
        case 'anularDano': return opcoes.dentroDeTabela && opcoes.eventoTipo !== 'danoQueZeraria' ? null : { tipo: 'anularDano' };
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
        case 'contador': {
            const id = texto(bruta.id, 60);
            const op = OPS_CONTADOR_ACAO.includes(bruta.op) ? bruta.op : 'somar';
            if (!id) return null;
            if (op === 'zerar') return { tipo: 'contador', id, op };
            const sorteio = op === 'somar' || op === 'definir' ? normalizarSorteio(bruta.sorteio) : '';
            if (bruta.sorteio !== undefined && bruta.sorteio !== null && bruta.sorteio !== '' && !sorteio) return null;
            let valor = numero(bruta.valor);
            if (valor === null || bruta.valor === '') { if (!sorteio) return null; valor = 1; }
            valor = Math.trunc(limitar(valor, -LIMITE_CONTADOR_GATILHO, LIMITE_CONTADOR_GATILHO));
            if (op === 'dividir' && valor < 1) return null;
            return { tipo: 'contador', id, op, valor, ...(sorteio ? { sorteio } : {}) };
        }
        case 'aplicarEstado': {
            const estado = texto(bruta.estado, 40);
            if (!ehEstadoValido(estado)) return null;
            const stacks = numero(bruta.stacks);
            // ⏳ `duracao` opcional (turnos 1 a 99 ou dado 'NdM(+K)' sorteado ao aplicar); sem ela o estado é permanente.
            const duracao = normalizarDuracaoSpec(bruta.duracao);
            return { tipo: 'aplicarEstado', estado, stacks: Math.floor(limitar(stacks === null ? 1 : stacks, 1, MAX_STACKS)), ...(duracao !== null ? { duracao } : {}) };
        }
        case 'removerEstado': {
            const estado = texto(bruta.estado, 40);
            return ehEstadoValido(estado) ? { tipo: 'removerEstado', estado } : null;
        }
        case 'ligarPoder':
        case 'desligarPoder': {
            const poderId = texto(bruta.poderId, 40);
            return poderId ? { tipo: bruta.tipo, poderId } : null;
        }
        case 'danoEmSi': {
            const modo = MODOS_DANO_EM_SI.includes(bruta.modo) ? bruta.modo : 'fixo';
            const valor = numero(bruta.valor);
            if (valor === null || valor <= 0) return null;
            return { tipo: 'danoEmSi', modo, valor: limitar(valor, 0, modo === 'fixo' ? LIMITE_VALOR_GATILHO : 100) };
        }
        case 'danoNoAtacante': {
            const modo = bruta.modo === 'fixo' ? 'fixo' : 'percDanoRecebido';
            const valor = numero(bruta.valor);
            if (valor === null || valor <= 0) return null;
            return { tipo: 'danoNoAtacante', modo, valor: limitar(valor, 0, modo === 'fixo' ? LIMITE_VALOR_GATILHO : 1000) };
        }
        case 'ganhoPermanente': {
            // Sem `unidade` (ações antigas) = 'bruto' + 'somar' (formato legado, sem campos novos). Percentual: `valor`/`fator` são % (pode ser negativo até -99,99).
            // Exceção: `modo` somar/multiplicar SEM `unidade` (a IA esqueceu) = percentual (evita ganho 100x maior). Ações legadas nunca têm `modo`.
            const modoExplicito = bruta.modo === 'somar' || bruta.modo === 'multiplicar';
            const perc = bruta.unidade === 'percentual' || (bruta.unidade === undefined && modoExplicito);
            const modoGp = bruta.modo === 'multiplicar' ? 'multiplicar' : 'somar';
            // ⚔️ duracao 'combate': o ganho vai para ficha.ganhosCombate (zera no fim da luta). Ausente/'permanente' = formato antigo, sem o campo.
            const extra = { ...(perc ? { unidade: 'percentual', modo: modoGp } : {}), ...(bruta.duracao === 'combate' || bruta.duracaoGanho === 'combate' ? { duracao: 'combate' } : {}) };
            const minimo = perc ? LIMITE_GANHO_PERC_MIN : 0;
            const dc = bruta.deContador;
            if (dc && typeof dc === 'object') {
                const id = texto(dc.id, 60);
                const fator = numero(dc.fator);
                if (!id || fator === null || (perc ? fator === 0 : fator <= 0)) return null;
                return { tipo: 'ganhoPermanente', ...extra, deContador: { id, fator: limitar(fator, minimo, LIMITE_FATOR_GANHO), ...(dc.zerar === true ? { zerar: true } : {}) } };
            }
            const valor = numero(bruta.valor);
            if (valor === null || bruta.valor === '' || (perc ? valor === 0 : valor <= 0)) return null;
            return { tipo: 'ganhoPermanente', ...extra, valor: limitar(valor, minimo, LIMITE_GANHO_PERMANENTE) };
        }
        case 'rolarTabela': {
            if (opcoes.dentroDeTabela) return null;
            const dado = normalizarSorteio(bruta.dado);
            const linhas = Array.isArray(bruta.resultados) ? bruta.resultados : [];
            if (!dado || linhas.length === 0 || linhas.length > LIMITE_LINHAS_TABELA) return null;
            const resultados = []; let anterior = 0;
            for (const r of linhas) {
                if (!r || typeof r !== 'object') return null;
                const ate = numero(r.ate);
                if (ate === null || r.ate === '' || r.ate === null) return null;
                const ateInt = Math.floor(limitar(ate, 0, LIMITE_ATE_TABELA));
                if (ateInt <= anterior) return null; // crescente (estrito)
                anterior = ateInt;
                const brutas = Array.isArray(r.acoes) ? r.acoes.slice(0, LIMITE_ACOES_POR_GATILHO + 1) : [];
                if (brutas.length === 0 || brutas.length > LIMITE_ACOES_POR_GATILHO) return null;
                const acoes = brutas.map(a => normalizarAcaoGatilho(a, { eventoTipo: opcoes.eventoTipo, dentroDeTabela: true }));
                if (acoes.some(a => !a)) return null;
                const t = texto(r.texto, 120);
                resultados.push({ ate: ateInt, ...(t ? { texto: t } : {}), acoes });
            }
            return { tipo: 'rolarTabela', dado, resultados };
        }
        case 'pedirEscolha': {
            if (opcoes.dentroDeTabela) return null; // não aninha dentro de rolarTabela nem de outra escolha
            const brutasOp = Array.isArray(bruta.opcoes) ? bruta.opcoes : [];
            if (brutasOp.length < MIN_OPCOES_ESCOLHA || brutasOp.length > LIMITE_OPCOES_ESCOLHA) return null;
            const opcoesOk = [];
            for (const o of brutasOp) {
                if (!o || typeof o !== 'object') return null;
                const t = texto(o.texto, 80);
                const brutas = Array.isArray(o.acoes) ? o.acoes.slice(0, LIMITE_ACOES_POR_GATILHO + 1) : [];
                if (!t || brutas.length === 0 || brutas.length > LIMITE_ACOES_POR_GATILHO) return null;
                const acoes = brutas.map(a => normalizarAcaoGatilho(a, { eventoTipo: opcoes.eventoTipo, dentroDeTabela: true }));
                if (acoes.some(a => !a)) return null;
                opcoesOk.push({ texto: t, acoes });
            }
            const pergunta = texto(bruta.pergunta, 120);
            return { tipo: 'pedirEscolha', ...(pergunta ? { pergunta } : {}), opcoes: opcoesOk };
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
    switch (bruto.tipo) {
        case 'danoQueZeraria': return { tipo: 'danoQueZeraria' };
        case 'vidaAbaixoDe': {
            let de = numero(bruto.de); let ate = numero(bruto.ate);
            if (de === null && ate === null) return null;
            if (de === null) de = ate;
            if (ate === null) ate = de;
            de = Math.floor(limitar(de, 0, 100)); ate = Math.floor(limitar(ate, 0, 100));
            if (ate > de) [de, ate] = [ate, de];
            return { tipo: 'vidaAbaixoDe', de, ate };
        }
        case 'acertou':
        case 'atingido':
            return { tipo: bruto.tipo, nivel: NIVEIS_ACERTO.includes(bruto.nivel) ? bruto.nivel : 'qualquer' };
        case 'poderLigou':
        case 'poderDesligou': {
            const poderId = texto(bruto.poderId, 40);
            return poderId ? { tipo: bruto.tipo, poderId } : { tipo: bruto.tipo };
        }
        case 'contadorAtingiu': {
            const contadorId = texto(bruto.contadorId, 60);
            const valor = numero(bruto.valor);
            if (!contadorId || valor === null || bruto.valor === '') return null;
            return { tipo: 'contadorAtingiu', contadorId, op: OPS_CONTADOR_EVENTO.includes(bruto.op) ? bruto.op : '>=', valor: Math.trunc(limitar(valor, -LIMITE_CONTADOR_GATILHO, LIMITE_CONTADOR_GATILHO)) };
        }
        default: return { tipo: bruto.tipo };
    }
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
        if (!evento) { descartados.push({ nome, motivo: g.evento && g.evento.tipo === 'contadorAtingiu' ? 'escolha o contador e o valor' : 'evento desconhecido' }); return; }
        if (evento.tipo !== 'danoQueZeraria' && Array.isArray(g.acoes) && g.acoes.some(a => a && a.tipo === 'anularDano')) { descartados.push({ nome, motivo: "'anular o dano' só vale em 'golpe me levaria a 0'" }); return; }
        const acoesBrutas = Array.isArray(g.acoes) ? g.acoes.slice(0, LIMITE_ACOES_POR_GATILHO) : [];
        const acoes = acoesBrutas.map(a => normalizarAcaoGatilho(a, { eventoTipo: evento.tipo }));
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
            limite = g.limite.por === 'turno' ? { max: Math.min(LIMITE_USOS, Math.max(1, Math.floor(numero(g.limite.max)))), por: 'turno' } : normalizarUsos(g.limite.max, g.limite.por);
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
        if (saida.modo === 'opcional') saida.armado = g.armado === true; // consentimento nunca vale por omissão
        else if (g.armado === true || g.armado === false) saida.armado = g.armado;
        if (saida.modo === 'opcional' && g.perguntar === true) saida.perguntar = true;
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
export function coletarGatilhos(ficha, opcoes = {}) {
    const tambemLigado = opcoes && opcoes.tambemLigado !== undefined && opcoes.tambemLigado !== null ? String(opcoes.tambemLigado) : null;
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
        const ligado = !!p.ativa || (tambemLigado !== null && tambemLigado === fonte.id);
        juntar(p.gatilhos, fonte, '', '', ligado);
        listasDaForma(p).forEach(({ lista, sufixo }) => juntar(lista, fonte, '', sufixo, ligado));
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

// Usos que ainda restam de um limite de gatilho. 'turno' guarda { n, turno: true } em combate.usosPoderes (zerado no turnoInicio do dono);
// 'cena' e 'descanso' seguem core/usosPoder.js.
export function usosRestantesDoGatilho(ficha, chave, limite, cena = 'default') {
    if (!limite) return Infinity;
    if (limite.por === 'turno') {
        const reg = ficha && ficha.combate && ficha.combate.usosPoderes ? ficha.combate.usosPoderes[chave] : null;
        const gastos = reg && typeof reg === 'object' && reg.turno === true ? Math.max(0, Math.floor(Number(reg.n) || 0)) : 0;
        return Math.max(0, limite.max - gastos);
    }
    return usosRestantes(ficha, { id: chave, usosMax: limite.max, usosPor: limite.por }, cena);
}

// ---------- 🧮 Faixas ----------

// O contador "passou a valer" a condição (borda): não valia antes e vale depois.
const cumpre = (op, v, alvo) => (op === '==' ? v === alvo : v >= alvo);
export const contadorCruzou = (ev, antes, depois) => cumpre(ev.op, Number(depois), ev.valor) && !cumpre(ev.op, Number(antes), ev.valor);

// O evento do runtime casa com o do gatilho? (os eventos de Vida têm a conta própria em avaliarGatilhos)
function eventoCasa(g, fonte, evento, contexto) {
    const ev = g.evento;
    switch (ev.tipo) {
        case 'acertou': return ev.nivel === 'qualquer' || ev.nivel === (evento.nivel || contexto.nivel);
        case 'atingido': return !ev.nivel || ev.nivel === 'qualquer' || ev.nivel === (evento.nivel || contexto.nivel);
        case 'poderLigou':
        case 'poderDesligou': {
            const id = String(evento.poderId ?? contexto.poderId ?? '');
            if (!ev.poderId) return fonte.tipo === 'poder' && fonte.id === id;
            return ev.poderId === 'qualquer' || ev.poderId === id;
        }
        case 'contadorAtingiu': {
            const cid = String(evento.contadorId ?? contexto.contadorId ?? '');
            return ev.contadorId === cid && contadorCruzou(ev, evento.valorAntes ?? contexto.valorAntes, evento.valorDepois ?? contexto.valorDepois);
        }
        default: return true; // errou, inimigoErrou, turnoInicio, turnoFim, inicioDeLuta, fimDeLuta
    }
}

export const percentualDaVida = (vidaBruta, vidaMaxBruta) => {
    const max = Number(vidaMaxBruta);
    if (!(max > 0)) return NaN;
    return Math.max(0, (Number(vidaBruta) || 0) / max * 100);
};
const dentroDaFaixa = (pct, de, ate) => Number.isFinite(pct) && Math.floor(pct + 1e-9) >= ate && Math.floor(pct + 1e-9) <= de;

// ---------- 🎯 Avaliação ----------

// avaliarGatilhos({ tipo, ...params }, contexto, ficha, opcoes) -> { acoes, bloqueados, textos, disparados }.
//   contexto: { vidaAntes, vidaDepois, vidaMaxBruta?, eventoId?, cenaId?, profundidade?, jaDisparados? } (Vida em escala BRUTA)
//     danoQueZeraria: vidaAntes e vidaDepois = a Vida antes e a que ficaria sem o gatilho (vidaDepois <= 0 dispara; vidaAntes precisa ser > 0)
//     vidaAbaixoDe:   vidaAntes e vidaDepois = a Vida antes e depois do dano
//     acertou/atingido: nivel ('normal'|'critico'|'fatal'); poderLigou/poderDesligou: poderId; contadorAtingiu: contadorId, valorAntes, valorDepois
//     decisoes: { [chave]: true|false } (respostas do dono ao `perguntar`; false = o gatilho não dispara e não gasta o limite; sem decisão = vale `armado`)
//     perguntas: array opcional; recebe { chave, nome, fonte } dos gatilhos com `perguntar` que disparariam sem decisão (para a UI perguntar antes de gravar)
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
        // Opcional: só dispara com armado === true (ausente = desarmado). Automático ignora `armado`.
        if (g.modo === 'opcional' && g.armado !== true) return bloquear('desarmado');
        if (profundidade >= PROFUNDIDADE_MAX_GATILHOS) return bloquear('profundidade máxima');
        if (ja.has(chave)) return bloquear('já disparou nesta cadeia');
        if (contexto.eventoId && registros[chave] && registros[chave].ultimoEvento === contexto.eventoId) return bloquear('evento já tratado');
        if (g.limite && !(usosRestantesDoGatilho(ficha, chave, g.limite, cena) > 0)) return bloquear('sem usos');

        const vidaAtualFicha = Number(ficha.vida && ficha.vida.atual) || 0;
        const eventoDeVida = g.evento.tipo === 'danoQueZeraria' || g.evento.tipo === 'vidaAbaixoDe';
        const antes = eventoDeVida ? (Number(contexto.vidaAntes) || 0) : vidaAtualFicha; const depois = eventoDeVida ? (Number(contexto.vidaDepois) || 0) : vidaAtualFicha;
        if (!eventoDeVida) {
            if (!eventoCasa(g, fonte, evento, contexto)) return;
        } else if (g.evento.tipo === 'danoQueZeraria') {
            if (!(antes > 0 && depois <= 0)) return;
        } else {
            const pctDepois = percentualDaVida(depois, vidaMax);
            const pctAntes = percentualDaVida(antes, vidaMax);
            if (!(depois < antes) || !dentroDaFaixa(pctDepois, g.evento.de, g.evento.ate) || dentroDaFaixa(pctAntes, g.evento.de, g.evento.ate)) return;
        }
        const vidaDaCondicao = g.fase === 'antes' ? antes : depois;
        if (!g.condicoes.every(c => condicaoPassa(c, ficha, vidaDaCondicao, ctxCombate))) return bloquear('condição não atendida');

        if (g.modo === 'opcional' && g.perguntar === true) {
            const d = contexto.decisoes ? contexto.decisoes[chave] : undefined;
            if (d === false) return bloquear('recusado pelo dono');
            if (d === undefined && Array.isArray(contexto.perguntas)) contexto.perguntas.push({ chave, nome: g.nome, fonte: fonte.nome });
        }
        ja.add(chave);
        resultado.disparados.push({ chave, gatilho: g, fonte });
        resultado.textos.push(`🔔 ${g.nome} disparou`);
        g.acoes.forEach(a => resultado.acoes.push({ ...a, gatilhoId: g.id, gatilhoNome: g.nome, fase: g.fase, chave, fonte }));
    });
    return resultado;
}

// Quais gatilhos com `perguntar` DISPARARIAM neste evento (sem aplicar nada): [{ chave, nome, fonte }]. Os que já têm decisão em contexto.decisoes saem da lista.
export function preverGatilhos(evento, contexto = {}, ficha = null, opcoes = {}) {
    const perguntas = [];
    avaliarGatilhos(evento, { ...contexto, perguntas }, ficha, opcoes);
    return perguntas;
}

// Chave de um gatilho na lista de um Poder (a mesma de coletarGatilhos): usada para decisões e por quem age sobre um gatilho específico.
export const chaveDoGatilhoDoPoder = (poderId, gatilhoId) => chaveSegura(`${poderId}:${gatilhoId}`);

// ---------- 💬 Frase legível (cartão do Poder, editor) ----------

const fmtN = (n) => Math.floor(Number(n) || 0).toLocaleString('pt-BR');

const nomeDoContador = (id, ctx) => {
    const c = ((ctx && ctx.contadores) || []).find(x => x && String(x.id) === String(id));
    return c ? c.nome : 'um contador';
};
const nomeDoPoder = (id, ctx) => {
    const p = ((ctx && ctx.poderes) || []).find(x => x && String(x.id) === String(id));
    return p ? p.nome : 'um Poder';
};
const NOME_NIVEL = { normal: 'normal', critico: 'crítico', fatal: 'crítico fatal' };

// ctx opcional: { contadores: [{ id, nome }], poderes: [{ id, nome }] } para nomes legíveis no lugar de ids.
export function descreverAcaoGatilho(a, ctx = null) {
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
        case 'contador': {
            const nome = nomeDoContador(a.id, ctx);
            if (a.op === 'zerar') return `zerar ${nome}`;
            if (a.op === 'dividir') return `dividir ${nome} por ${a.valor}`;
            const sinal = a.valor < 0 ? '−' : '+';
            const mag = a.sorteio ? `${a.sorteio}${Math.abs(a.valor) > 1 ? ` x ${Math.abs(a.valor)}` : ''}` : String(Math.abs(a.valor));
            return a.op === 'definir' ? `colocar ${nome} em ${a.sorteio ? a.sorteio : a.valor}` : `${sinal}${mag} em ${nome}`;
        }
        case 'aplicarEstado': return `aplicar ${a.stacks}x ${nomeDoEstado(a.estado)} em mim${a.duracao ? ` por ${descreverDuracaoSpec(a.duracao)}` : ''}`;
        case 'removerEstado': return `remover ${nomeDoEstado(a.estado)}`;
        case 'ligarPoder': return `ligar ${nomeDoPoder(a.poderId, ctx)}`;
        case 'desligarPoder': return `desligar ${nomeDoPoder(a.poderId, ctx)}`;
        case 'danoNoAtacante': return a.modo === 'fixo' ? `causar ${fmtN(a.valor)} de dano no atacante` : `devolver ${a.valor}% do dano recebido (antes do escudo) ao atacante`;
        case 'rolarTabela': return descreverTabela(a, ctx);
        case 'pedirEscolha': return descreverEscolha(a, ctx);
        case 'ganhoPermanente': {
            const perc = a.unidade === 'percentual';
            const ateOFim = a.duracao === 'combate' ? ' até o fim do combate' : '';
            const sufixo = perc ? (a.modo === 'multiplicar' ? ' (multiplica)' : ' (soma)') : '';
            const sinalPerc = (n) => `${n > 0 ? '+' : ''}${n}%`;
            if (a.deContador) {
                return `ganhar Poder${perc ? '' : ' permanente'}: ${nomeDoContador(a.deContador.id, ctx)} x ${a.deContador.fator}${perc ? '%' : ''}${a.deContador.zerar ? ' (e zerar o contador)' : ''}${perc ? sufixo : ' (valor bruto, antigo)'}${ateOFim}`;
            }
            return perc ? `ganha ${sinalPerc(a.valor)} de Poder${sufixo}${ateOFim}` : `ganhar +${a.valor} de Poder${a.duracao === 'combate' ? ' até o fim do combate' : ' permanente'} (valor bruto, antigo)`;
        }
        case 'danoEmSi': return a.modo === 'fixo' ? `sofrer ${fmtN(a.valor)} de dano` : `sofrer dano de ${a.valor}% da Vida ${a.modo === 'percMax' ? 'máxima' : 'atual'}`;
        default: return '';
    }
}

// "rola 1d4: 1→curar 10%; 2-3→…" (a linha vale do número seguinte ao da anterior até o seu).
export function descreverTabela(a, ctx = null) {
    let de = 1;
    const linhas = (a.resultados || []).map((r) => {
        const faixa = r.ate <= de ? String(r.ate) : `${de}-${r.ate}`;
        de = r.ate + 1;
        const o = (r.acoes || []).map(x => descreverAcaoGatilho(x, ctx)).filter(Boolean).join(' + ');
        return `${faixa}→${r.texto ? `"${r.texto}" ` : ''}${o}`;
    });
    return `rola ${a.dado}: ${linhas.join('; ')}`;
}

// 'escolher (Qual?): "Curar" → curar 10 | "Escudo" → ganhar escudo de 5'.
export function descreverEscolha(a, ctx = null) {
    const ops = (a.opcoes || []).map(o => `"${o.texto}" → ${(o.acoes || []).map(x => descreverAcaoGatilho(x, ctx)).filter(Boolean).join(' + ')}`);
    return `escolher${a.pergunta ? ` (${a.pergunta})` : ''}: ${ops.join(' | ')}`;
}

export function descreverEventoGatilho(ev, ctx = null) {
    if (!ev) return '';
    switch (ev.tipo) {
        case 'danoQueZeraria': return 'Quando um golpe me levaria a 0';
        case 'vidaAbaixoDe': return ev.de === ev.ate ? `Quando a Vida cair para ${ev.de}%` : `Quando a Vida cair para entre ${ev.de}% e ${ev.ate}%`;
        case 'acertou': return ev.nivel && ev.nivel !== 'qualquer' ? `Quando eu acertar um golpe ${NOME_NIVEL[ev.nivel]}` : 'Quando eu acertar um golpe';
        case 'errou': return 'Quando eu errar um golpe';
        case 'atingido': return ev.nivel && ev.nivel !== 'qualquer' ? `Quando eu sofrer dano na Vida num golpe ${NOME_NIVEL[ev.nivel]}` : 'Quando eu sofrer dano na Vida num golpe';
        case 'inimigoErrou': return 'Quando um golpe errar em mim';
        case 'turnoInicio': return 'No início do meu turno';
        case 'turnoFim': return 'No fim do meu turno';
        case 'poderLigou': return ev.poderId && ev.poderId !== 'qualquer' ? `Quando ${nomeDoPoder(ev.poderId, ctx)} ligar` : (ev.poderId === 'qualquer' ? 'Quando qualquer Poder ligar' : 'Quando este Poder ligar');
        case 'poderDesligou': return ev.poderId && ev.poderId !== 'qualquer' ? `Quando ${nomeDoPoder(ev.poderId, ctx)} desligar` : (ev.poderId === 'qualquer' ? 'Quando qualquer Poder desligar' : 'Quando este Poder desligar');
        case 'inicioDeLuta': return 'No início do combate';
        case 'fimDeLuta': return 'No fim da cena/combate';
        case 'contadorAtingiu': return `Quando um gatilho levar ${nomeDoContador(ev.contadorId, ctx)} ${ev.op === '==' ? 'a exatamente' : 'a pelo menos'} ${ev.valor}`;
        default: return '';
    }
}

export function descreverGatilho(g, ctx = null) {
    if (!g || !g.evento) return '';
    const quando = descreverEventoGatilho(g.evento, ctx);
    const cond = (g.condicoes || []).map((c) => {
        const m = /^(vida_maior_que|vida_menor_que):(.+)$/.exec(c);
        return m ? `Vida ${m[1] === 'vida_maior_que' ? 'maior' : 'menor'} que ${m[2]}` : c;
    });
    const lim = g.limite ? ` (${g.limite.max}x ${(PERIODOS_GATILHO.find(p => p.id === g.limite.por) || { rotulo: g.limite.por }).rotulo})` : '';
    // Em 'golpe me levaria a 0', ficar com N de vida já anula o golpe.
    const frases = (g.acoes || []).map(a => descreverAcaoGatilho(a, ctx) + (g.evento.tipo === 'danoQueZeraria' && a.tipo === 'definirVida' ? ' (já anula o golpe)' : ''));
    const modo = g.modo === 'opcional' ? (g.armado !== true ? ' (opcional, desarmado)' : ` (opcional, armado${g.perguntar ? ', pergunta antes' : ''})`) : '';
    return `${quando}${cond.length ? ` e ${cond.join(', ')}` : ''}: ${frases.join(', ')}${lim}${modo}`;
}
