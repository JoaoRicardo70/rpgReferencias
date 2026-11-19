// ==========================================
// 🔁 DEFLEXÃO (aplicação) — o cliente do DEFENSOR grava o dano devolvido no atacante, como o Reflexo (core/reflexo.js) faz.
//   Ver as regras em core/deflexao.js. O dano passa pelas Reduções/Resistências do atacante (core/alvoCombate.js > reduzirDanoNoAlvo).
// ==========================================
import { resolverAtacanteParaDeflexao } from '../core/deflexao';
import { reduzirDanoNoAlvo } from '../core/alvoCombate';
import { danoExibidoParaBruto } from '../core/vitals';
import { gravarVidaDoAlvo } from './danoAlvo';

// → { ok, final?, textos?, motivo? }. `dano` = dano ORIGINAL do golpe (escala exibida, o do feed); falha fechada sem atacante/CA válidos.
export function aplicarDanoDeflexao({ atacante, dano, elemento = '', personagens, dummies, divisorPoderMesa }) {
    const r = resolverAtacanteParaDeflexao(atacante, { personagens, dummies, divisorPoderMesa });
    if (!r) return { ok: false, motivo: 'O atacante não está na mesa (ou não tem CA válida): o dano da Deflexão não foi aplicado.' };
    const final = reduzirDanoNoAlvo(r.alvo, Math.max(0, Number(dano) || 0), elemento || '', {}).final;
    if (!(final > 0)) return { ok: true, final: 0, textos: [] };
    const gv = gravarVidaDoAlvo(r.id, r.alvo, Math.max(0, (Number(r.alvo.hpAtual) || 0) - danoExibidoParaBruto(final)), { elemento: elemento || null });
    return { ok: true, final, textos: (gv && gv.textos) || [] };
}
