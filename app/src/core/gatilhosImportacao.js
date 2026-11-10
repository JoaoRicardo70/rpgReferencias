// ==========================================
// 🔔 GATILHOS VINDOS DA IA (importador e Sexta-Feira) — lógica pura. A IA descreve a regra ("quando X, faça Y"); quem VALIDA é
// normalizarGatilhos (core/gatilhos.js). Aqui só se prepara a entrada e se separa o que foi descartado (vai para `naoAplicado`).
// Regras: a IA NUNCA decide `modo`, `armado`, `perguntar`, `passivo` nem `mestreDesligou` (são removidos antes de validar);
// o gatilho sai SEMPRE 'opcional' e DESARMADO (nada dispara de graça). O importador marca `modoPendente` para o jogador responder
// "automático ou opcional?" na prévia; a Sexta-Feira o entrega desarmado e o dono arma depois.
// Limite "por luta" não existe: "1 vez por combate/luta/batalha" vira 'cena'.
// ==========================================
import { normalizarGatilhos, LIMITE_ACOES_POR_GATILHO, LIMITE_LINHAS_TABELA, LIMITE_OPCOES_ESCOLHA } from './gatilhos.js';

const semAcento = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const ehObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const PERIODOS_COMO_CENA = ['luta', 'combate', 'batalha', 'encontro'];

// Campos que só o jogador/Mestre decidem.
const CAMPOS_PROIBIDOS = ['modo', 'armado', 'perguntar', 'passivo', 'mestreDesligou', 'modoPendente'];

function prepararBruto(g) {
    const copia = { ...g };
    CAMPOS_PROIBIDOS.forEach(c => { delete copia[c]; });
    delete copia.id; // id novo e estável é gerado por normalizarGatilhos
    if (ehObjeto(copia.limite)) {
        const por = semAcento(copia.limite.por).replace(/^por\s+/, '');
        copia.limite = { ...copia.limite, por: PERIODOS_COMO_CENA.includes(por) ? 'cena' : por };
    }
    return copia;
}

// Motivo para recusar ANTES de validar (coisas que normalizarGatilhos cortaria em silêncio). '' = pode seguir.
function motivoDeRecusa(g) {
    if (Array.isArray(g.acoes) && g.acoes.length > LIMITE_ACOES_POR_GATILHO) return `mais de ${LIMITE_ACOES_POR_GATILHO} ações`;
    for (const a of (Array.isArray(g.acoes) ? g.acoes : [])) {
        if (a && a.tipo === 'rolarTabela' && Array.isArray(a.resultados)) {
            if (a.resultados.length > LIMITE_LINHAS_TABELA) return `tabela com mais de ${LIMITE_LINHAS_TABELA} faixas`;
            if (a.resultados.some(r => r && Array.isArray(r.acoes) && r.acoes.length > LIMITE_ACOES_POR_GATILHO)) return `faixa da tabela com mais de ${LIMITE_ACOES_POR_GATILHO} ações`;
        }
        if (a && a.tipo === 'pedirEscolha' && Array.isArray(a.opcoes)) {
            if (a.opcoes.length > LIMITE_OPCOES_ESCOLHA) return `escolha com mais de ${LIMITE_OPCOES_ESCOLHA} opções`;
            if (a.opcoes.some(o => o && Array.isArray(o.acoes) && o.acoes.length > LIMITE_ACOES_POR_GATILHO)) return `opção da escolha com mais de ${LIMITE_ACOES_POR_GATILHO} ações`;
        }
    }
    return '';
}

// Referências que a IA não tem como saber (ids da ficha do jogador): o jogador precisa conferir.
function referenciasParaConferir(g) {
    const refs = [];
    const olhar = (a) => {
        if (!a || typeof a !== 'object') return;
        if (a.tipo === 'contador' && a.id) refs.push(`contador "${a.id}"`);
        if (a.tipo === 'ganhoPermanente' && a.deContador && a.deContador.id) refs.push(`contador "${a.deContador.id}"`);
        if ((a.tipo === 'ligarPoder' || a.tipo === 'desligarPoder') && a.poderId) refs.push(`Poder "${a.poderId}"`);
        if (a.tipo === 'rolarTabela') (a.resultados || []).forEach(r => (r && r.acoes || []).forEach(olhar));
        if (a.tipo === 'pedirEscolha') (a.opcoes || []).forEach(o => (o && o.acoes || []).forEach(olhar));
    };
    (g.acoes || []).forEach(olhar);
    if (g.evento && g.evento.tipo === 'contadorAtingiu') refs.push(`contador "${g.evento.contadorId}"`);
    if (g.evento && (g.evento.tipo === 'poderLigou' || g.evento.tipo === 'poderDesligou') && g.evento.poderId && g.evento.poderId !== 'qualquer') refs.push(`Poder "${g.evento.poderId}"`);
    return refs;
}

// Lê os gatilhos da resposta da IA. Devolve { gatilhos, naoAplicado: [frases], avisos: [frases] }.
// `gatilhos` já validados, todos 'opcional' + `armado:false`. Nunca lança.
export function lerGatilhosDaIA(brutos) {
    const naoAplicado = []; const avisos = [];
    if (brutos === undefined || brutos === null || brutos === '' || (Array.isArray(brutos) && brutos.length === 0)) return { gatilhos: [], naoAplicado, avisos };
    if (!Array.isArray(brutos)) {
        naoAplicado.push('Gatilhos em formato inválido (esperava uma lista), não importados');
        return { gatilhos: [], naoAplicado, avisos };
    }
    const candidatos = [];
    brutos.forEach((g) => {
        if (!ehObjeto(g)) { naoAplicado.push('Gatilho em formato inválido, não importado'); return; }
        const nome = String(g.nome ?? '').trim().slice(0, 60) || 'Gatilho';
        const recusa = motivoDeRecusa(g);
        if (recusa) { naoAplicado.push(`Gatilho não importado (${nome}): ${recusa}`); return; }
        candidatos.push(prepararBruto(g));
    });
    const { gatilhos, descartados } = normalizarGatilhos(candidatos);
    descartados.forEach(d => naoAplicado.push(`Gatilho não importado (${d.nome}): ${d.motivo}`));
    const prontos = gatilhos.map((g) => {
        const refs = referenciasParaConferir(g);
        if (refs.length) avisos.push(`Gatilho "${g.nome}" usa ${[...new Set(refs)].join(', ')}: confira se existe na ficha (senão não faz nada).`);
        return { ...g, modo: 'opcional', armado: false };
    });
    return { gatilhos: prontos, naoAplicado, avisos };
}

// ---------- Prévia do importador ----------

export const MODOS_DECISAO_GATILHO = ['automatico', 'opcional'];

// Marca como à espera de resposta ("automático ou opcional?").
export const marcarGatilhosPendentes = (gatilhos) => gatilhos.map(g => ({ ...g, modoPendente: true }));

export const gatilhoFaltaResponder = (g) => !g || g.modoPendente === true;

// Grava a resposta ('automatico' | 'opcional' | '' para desfazer). Opcional entra DESARMADO: o dono arma depois. Devolve um gatilho novo.
export function decidirModoDoGatilho(g, modo) {
    const { modoPendente, ...resto } = g;
    if (modo === 'automatico') {
        const { armado, perguntar, ...sem } = resto;
        return { ...sem, modo: 'automatico' };
    }
    if (modo === 'opcional') return { ...resto, modo: 'opcional', armado: false };
    return { ...resto, modo: 'opcional', armado: false, modoPendente: true };
}

// Fecha o gatilho para gravar: o que ficou sem resposta vira opcional desarmado (nunca dispara de graça).
export function finalizarGatilho(g) {
    const { modoPendente, ...resto } = g;
    if (modoPendente === true || !MODOS_DECISAO_GATILHO.includes(resto.modo)) return { ...resto, modo: 'opcional', armado: false };
    if (resto.modo === 'opcional') return { ...resto, armado: resto.armado === true };
    return resto;
}
