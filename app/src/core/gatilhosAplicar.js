// ==========================================
// 🔔 APLICAR AÇÕES DE GATILHOS — lógica pura sobre o RASCUNHO da ficha (Immer) ou um clone solto.
// Quem decide QUAIS ações valem é core/gatilhos.js > avaliarGatilhos; aqui elas são executadas e viram frases do feed.
// Devolve { textos, anulado, caminhos }: `caminhos` = campos tocados (formato do Firebase: 'vida/atual', 'escudos'...), para quem grava
// numa ficha de OUTRO jogador mandar só eles (services/danoAlvo.js). Nada fica `undefined`: o que some vira delete na ficha e null no Firebase.
// ==========================================
import { FATOR_EXIBICAO_VITAIS } from './vitals.js';
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

// Registra no rascunho que estes gatilhos dispararam: gasta o uso do limite (por cena/descanso) e guarda o evento (idempotência).
export function registrarDisparos(ficha, disparados, { eventoId, cenaId = 'default' } = {}) {
    const caminhos = [];
    (disparados || []).forEach(({ chave, gatilho }) => {
        if (gatilho.limite) {
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

// Executa as ações (já avaliadas) no rascunho. ctx: { vidaMaxBruta?, eventoId?, cenaId?, disparados? }.
export function aplicarAcoesNoRascunho(ficha, acoes, ctx = {}) {
    const textos = []; const caminhos = new Set(); let anulado = false;
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
            default: break;
        }
    });
    return { textos, anulado, caminhos: [...caminhos] };
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
