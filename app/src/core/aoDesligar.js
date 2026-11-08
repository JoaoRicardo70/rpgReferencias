// ==========================================
// 💥 EFEITO AO DESLIGAR — lógica pura. Alguns Poderes cobram um preço ao serem desligados à mão ("Portão 10: 238d6 de dano em si"):
//   aoDesligar: { dadosQtd, dadosFaces, texto? }
// O dano cai direto na Vida do dono (sem Reduções, como o dano de estados), só números: não existe regra de morte aqui.
// Desligamento automático (sem energia, core/custoPorTurno.js), exclusão e edição NÃO disparam.
// ==========================================
import { aplicarDanoNaVida } from './danoVida.js';

export const LIMITE_DADOS_AO_DESLIGAR = 1000;

export function normalizarAoDesligar(bruto) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
    const qtd = Math.floor(Number(bruto.dadosQtd));
    const faces = Math.floor(Number(bruto.dadosFaces));
    if (!Number.isFinite(qtd) || qtd <= 0 || !Number.isFinite(faces) || faces <= 0) return null;
    const saida = { dadosQtd: Math.min(LIMITE_DADOS_AO_DESLIGAR, qtd), dadosFaces: Math.min(LIMITE_DADOS_AO_DESLIGAR, faces) };
    const texto = typeof bruto.texto === 'string' ? bruto.texto.trim().slice(0, 300) : '';
    if (texto) saida.texto = texto;
    return saida;
}

// Rola os dados do efeito (rng injetável para teste). Devolve o total, ou 0 se o efeito não existe.
export function rolarAoDesligar(poder, rng = Math.random) {
    const a = normalizarAoDesligar(poder && poder.aoDesligar);
    if (!a) return 0;
    let total = 0;
    for (let i = 0; i < a.dadosQtd; i++) total += Math.floor(rng() * a.dadosFaces) + 1;
    return total;
}

// Tira o dano (escala exibida) da Vida no rascunho. Devolve o dano aplicado. Nunca passa de zero.
// Passa pelo ponto único de dano (core/danoVida.js) SEM escudo (dano direto): com Imunidade total vira 0 (devolve 0) e gatilhos podem disparar.
// ctx opcional: { nome, cenaId, textos: [] } — as frases dos gatilhos/imunidade entram em ctx.textos.
export function aplicarDanoEmSiMesmo(ficha, danoExibido, ctx = {}) {
    if (!ficha || !ficha.vida || !(danoExibido > 0)) return 0;
    const r = aplicarDanoNaVida(ficha, danoExibido, { ...ctx, semEscudo: true });
    if (Array.isArray(ctx.textos)) r.textos.forEach(t => ctx.textos.push(t));
    return r.imune || r.anulado ? 0 : danoExibido; // valor realmente aplicado (Imunidade total ou gatilho que anulou = 0)
}

export function descreverAoDesligar(poder) {
    const a = normalizarAoDesligar(poder && poder.aoDesligar);
    return a ? `${a.dadosQtd}d${a.dadosFaces} de dano em si ao desligar` : '';
}
